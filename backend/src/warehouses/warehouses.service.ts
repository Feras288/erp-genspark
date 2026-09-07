// =====================================================
// WarehousesService — CRUD strictly scoped by companyId from JWT.
// NEVER accepts companyId from input. Soft-delete only (deletedAt).
// Dup-detection: code (NOT NULL, unique per company).
// Deletion is refused if any stockLevel for that warehouse has quantity > 0.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';

const PUBLIC_FIELDS = {
  id: true,
  companyId: true,
  code: true,
  name: true,
  nameAr: true,
  address: true,
  city: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
} as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: WarehouseQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.WarehouseWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { code: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.warehouse.count({ where }),
      this.prisma.warehouse.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: PUBLIC_FIELDS,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async get(companyId: string, id: string) {
    const w = await this.prisma.warehouse.findFirst({
      where: { id, companyId, deletedAt: null },
      select: PUBLIC_FIELDS,
    });
    if (!w) throw new NotFoundException('Warehouse not found');
    return w;
  }

  private async assertCodeUnique(
    tx: Tx,
    companyId: string,
    code: string,
    excludeId?: string,
  ) {
    const existing = await tx.warehouse.findFirst({
      where: {
        companyId,
        code,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Warehouse code already exists in this company');
  }

  async create(companyId: string, dto: CreateWarehouseDto, actorUserId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertCodeUnique(tx, companyId, dto.code);
      return tx.warehouse.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          isActive: dto.isActive ?? true,
          createdById: actorUserId,
          updatedById: actorUserId,
        } as Prisma.WarehouseUncheckedCreateInput,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'warehouses.created',
      entity: 'Warehouse',
      entityId: created.id,
      metadata: { code: created.code },
    });

    return created;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateWarehouseDto,
    actorUserId: string,
  ) {
    const current = await this.prisma.warehouse.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Warehouse not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.code !== undefined) {
        await this.assertCodeUnique(tx, companyId, dto.code, id);
      }

      const data: Prisma.WarehouseUpdateInput = {
        updatedBy: { connect: { id: actorUserId } },
      };
      if (dto.code !== undefined) data.code = dto.code;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.nameAr !== undefined) data.nameAr = dto.nameAr ?? null;
      if (dto.address !== undefined) data.address = dto.address ?? null;
      if (dto.city !== undefined) data.city = dto.city ?? null;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      return tx.warehouse.update({
        where: { id },
        data,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'warehouses.updated',
      entity: 'Warehouse',
      entityId: id,
    });

    return updated;
  }

  async remove(companyId: string, id: string, actorUserId: string) {
    const current = await this.prisma.warehouse.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Warehouse not found');

    // Refuse deletion if any stockLevel has quantity > 0 (compares numerically
    // because Prisma Decimal serializes as string with trailing zeros dropped).
    const blocking = await this.prisma.stockLevel.findFirst({
      where: {
        companyId,
        warehouseId: id,
        OR: [
          { quantity: { gt: 0 } },
          { reservedQuantity: { gt: 0 } },
        ],
      },
      select: { id: true, quantity: true, reservedQuantity: true, productId: true },
    });
    if (blocking) {
      throw new BadRequestException(
        'Cannot soft-delete a warehouse that has stock with quantity > 0. ' +
          'First transfer or adjust the stock elsewhere.',
      );
    }

    await this.prisma.warehouse.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: { connect: { id: actorUserId } },
      },
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'warehouses.deleted',
      entity: 'Warehouse',
      entityId: id,
    });

    return { id, isActive: false };
  }
}
