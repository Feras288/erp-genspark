// =====================================================
// InventoryService — Phase 3 inventory core.
//
// Rules:
//   * companyId scoped strictly from the JWT (caller passes it in).
//   * only products with type = PRODUCT may have stock.
//     SERVICE products are rejected (no stockLevel, no movement).
//   * stockLevel.quantity cannot go below 0 (manual floor).
//   * StockMovement is append-only — never UPDATE / DELETE; we only INSERT.
//   * Adjustments create a single movement (operator-chosen IN or OUT).
//   * Transfers create a paired TRANSFER_OUT + TRANSFER_IN in one tx.
//   * No sales/purchase/accounting integration in Phase 3.
//   * Decimal(18,4) quantities — Prisma serializes as string; we
//     compare numerically via Number() but the stored format is exact.
// =====================================================
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType, StockMovementType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockLevelQueryDto } from './dto/stock-level-query.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockTransferDto } from './dto/stock-transfer.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';

const STOCK_LEVEL_FIELDS = {
  id: true,
  companyId: true,
  productId: true,
  warehouseId: true,
  quantity: true,
  reservedQuantity: true,
  createdAt: true,
  updatedAt: true,
} as const;

const STOCK_MOVEMENT_FIELDS = {
  id: true,
  companyId: true,
  productId: true,
  warehouseId: true,
  movementType: true,
  direction: true,
  quantity: true,
  referenceType: true,
  referenceId: true,
  reason: true,
  notes: true,
  movementDate: true,
  createdAt: true,
  createdById: true,
} as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------- Stock levels --------------------

  async listLevels(companyId: string, q: StockLevelQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.StockLevelWhereInput = { companyId };

    if (q.productId) where.productId = q.productId;
    if (q.warehouseId) where.warehouseId = q.warehouseId;

    // Search joins to product name/sku — must filter to non-deleted products
    // of type PRODUCT (services excluded at both read and write).
    if (q.search) {
      const s = q.search;
      where.product = {
        companyId,
        deletedAt: null,
        isActive: true,
        type: ProductType.PRODUCT,
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { sku: { contains: s, mode: 'insensitive' } },
          { barcode: { contains: s, mode: 'insensitive' } },
        ],
      };
    } else {
      // Always restrict to active, non-deleted, type=PRODUCT products.
      where.product = {
        companyId,
        deletedAt: null,
        isActive: true,
        type: ProductType.PRODUCT,
      };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.stockLevel.count({ where }),
      this.prisma.stockLevel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: { ...STOCK_LEVEL_FIELDS, product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } } },
      }),
    ]);

    return { total, page, pageSize, items };
  }

  // -------------------- Adjustments --------------------

  async adjust(companyId: string, dto: StockAdjustmentDto, actorUserId: string) {
    const qty = Number(dto.quantity);
    if (!(qty > 0)) {
      throw new BadRequestException('quantity must be > 0');
    }

    // Pre-validate references (clear error messages, no scope leaks).
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: dto.productId, companyId, deletedAt: null },
        select: { id: true, type: true, isActive: true, name: true, sku: true },
      }),
      this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, companyId, deletedAt: null },
        select: { id: true, isActive: true, code: true, name: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (product.type !== ProductType.PRODUCT) {
      throw new BadRequestException('Only PRODUCT-type products can have stock (services excluded)');
    }
    if (!product.isActive) throw new BadRequestException('Product is inactive');
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (!warehouse.isActive) throw new BadRequestException('Warehouse is inactive');

    const isIn = dto.adjustmentType === StockMovementType.ADJUSTMENT_IN;
    const direction = isIn ? 'IN' : 'OUT';

    const result = await this.prisma.$transaction(async (tx) => {
      // Find or create the per-(product,warehouse) StockLevel owned by this company.
      const existing = await tx.stockLevel.findFirst({
        where: { companyId, productId: dto.productId, warehouseId: dto.warehouseId },
      });

      let currentQty = 0;
      if (existing) {
        currentQty = Number(existing.quantity);
      } else if (!isIn) {
        // Cannot OUT-adjust on a level that doesn't exist (would go negative).
        throw new BadRequestException('Cannot OUT-adjust: no stock level exists for this product/warehouse');
      }

      const newQty = isIn ? currentQty + qty : currentQty - qty;
      if (newQty < 0) {
        throw new BadRequestException(
          `Insufficient stock: current=${currentQty}, attempted OUT=${qty}`,
        );
      }

      const level = existing
        ? await tx.stockLevel.update({
            where: { id: existing.id },
            data: { quantity: newQty.toFixed(4) },
            select: STOCK_LEVEL_FIELDS,
          })
        : await tx.stockLevel.create({
            data: {
              companyId,
              productId: dto.productId,
              warehouseId: dto.warehouseId,
              quantity: newQty.toFixed(4),
              reservedQuantity: '0.0000',
            } as Prisma.StockLevelUncheckedCreateInput,
            select: STOCK_LEVEL_FIELDS,
          });

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          movementType: dto.adjustmentType,
          direction,
          quantity: qty.toFixed(4),
          referenceType: 'manual_adjustment',
          referenceId: null,
          reason: dto.reason,
          notes: dto.notes ?? null,
          createdById: actorUserId,
        } as Prisma.StockMovementUncheckedCreateInput,
        select: STOCK_MOVEMENT_FIELDS,
      });

      return { level, movement };
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'inventory.adjustment.created',
      entity: 'StockMovement',
      entityId: result.movement.id,
      metadata: {
        movementType: result.movement.movementType,
        quantity: result.movement.quantity,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
      },
    });

    return result;
  }

  // -------------------- Transfers --------------------

  async transfer(companyId: string, dto: StockTransferDto, actorUserId: string) {
    const qty = Number(dto.quantity);
    if (!(qty > 0)) {
      throw new BadRequestException('quantity must be > 0');
    }
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('fromWarehouseId and toWarehouseId must differ');
    }

    // Pre-validate references.
    const [product, fromW, toW] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: dto.productId, companyId, deletedAt: null },
        select: { id: true, type: true, isActive: true, name: true, sku: true },
      }),
      this.prisma.warehouse.findFirst({
        where: { id: dto.fromWarehouseId, companyId, deletedAt: null },
        select: { id: true, isActive: true, code: true, name: true },
      }),
      this.prisma.warehouse.findFirst({
        where: { id: dto.toWarehouseId, companyId, deletedAt: null },
        select: { id: true, isActive: true, code: true, name: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (product.type !== ProductType.PRODUCT) {
      throw new BadRequestException('Only PRODUCT-type products can be transferred');
    }
    if (!product.isActive) throw new BadRequestException('Product is inactive');
    if (!fromW) throw new NotFoundException('Source warehouse not found');
    if (!fromW.isActive) throw new BadRequestException('Source warehouse is inactive');
    if (!toW) throw new NotFoundException('Destination warehouse not found');
    if (!toW.isActive) throw new BadRequestException('Destination warehouse is inactive');

    const result = await this.prisma.$transaction(async (tx) => {
      // Source must already have a stockLevel with sufficient quantity.
      const source = await tx.stockLevel.findFirst({
        where: { companyId, productId: dto.productId, warehouseId: dto.fromWarehouseId },
      });
      const sourceQty = source ? Number(source.quantity) : 0;
      if (!source || sourceQty < qty) {
        throw new BadRequestException(
          `Insufficient source stock: available=${sourceQty}, requested=${qty}`,
        );
      }
      const newSourceQty = sourceQty - qty;

      await tx.stockLevel.update({
        where: { id: source.id },
        data: { quantity: newSourceQty.toFixed(4) },
      });

      // Destination: upsert.
      const dest = await tx.stockLevel.findFirst({
        where: { companyId, productId: dto.productId, warehouseId: dto.toWarehouseId },
      });
      const destQty = dest ? Number(dest.quantity) : 0;
      const newDestQty = destQty + qty;

      if (dest) {
        await tx.stockLevel.update({
          where: { id: dest.id },
          data: { quantity: newDestQty.toFixed(4) },
        });
      } else {
        await tx.stockLevel.create({
          data: {
            companyId,
            productId: dto.productId,
            warehouseId: dto.toWarehouseId,
            quantity: newDestQty.toFixed(4),
            reservedQuantity: '0.0000',
          } as Prisma.StockLevelUncheckedCreateInput,
        });
      }

      // Paired append-only movements: TRANSFER_OUT (source, OUT) + TRANSFER_IN (dest, IN).
      const out = await tx.stockMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          warehouseId: dto.fromWarehouseId,
          movementType: StockMovementType.TRANSFER_OUT,
          direction: 'OUT',
          quantity: qty.toFixed(4),
          referenceType: 'transfer',
          referenceId: null,
          notes: dto.notes ?? null,
          createdById: actorUserId,
        } as Prisma.StockMovementUncheckedCreateInput,
        select: STOCK_MOVEMENT_FIELDS,
      });

      const inn = await tx.stockMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          movementType: StockMovementType.TRANSFER_IN,
          direction: 'IN',
          quantity: qty.toFixed(4),
          referenceType: 'transfer',
          referenceId: out.id,
          notes: dto.notes ?? null,
          createdById: actorUserId,
        } as Prisma.StockMovementUncheckedCreateInput,
        select: STOCK_MOVEMENT_FIELDS,
      });

      return { out, inn };
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'inventory.transfer.created',
      entity: 'StockMovement',
      entityId: result.out.id,
      metadata: {
        transferOutId: result.out.id,
        transferInId: result.inn.id,
        productId: dto.productId,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        quantity: dto.quantity,
      },
    });

    return result;
  }

  // -------------------- Movements --------------------

  async listMovements(companyId: string, q: StockMovementQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.StockMovementWhereInput = { companyId };

    if (q.productId) where.productId = q.productId;
    if (q.warehouseId) where.warehouseId = q.warehouseId;
    if (q.movementType) where.movementType = q.movementType;

    if (q.dateFrom || q.dateTo) {
      where.movementDate = {};
      if (q.dateFrom) {
        const from = q.dateFrom instanceof Date ? q.dateFrom : new Date(q.dateFrom);
        where.movementDate.gte = from;
      }
      if (q.dateTo) {
        const to = q.dateTo instanceof Date ? q.dateTo : new Date(q.dateTo);
        where.movementDate.lte = to;
      }
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { movementDate: 'desc' },
        select: {
          ...STOCK_MOVEMENT_FIELDS,
          product: { select: { id: true, sku: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }
}
