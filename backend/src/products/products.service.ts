// =====================================================
// ProductsService — CRUD strictly scoped by companyId from JWT.
// NEVER accepts companyId from input. Soft-delete via deletedAt.
// Dup-detection: sku (NOT NULL), barcode (NULL distinct).
// Decimal-as-string for money fields.
// =====================================================
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

const PUBLIC_FIELDS = {
  id: true,
  companyId: true,
  sku: true,
  name: true,
  nameAr: true,
  description: true,
  type: true,
  barcode: true,
  unit: true,
  priceBeforeVat: true,
  vatRate: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: ProductQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { barcode: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.type) where.type = q.type as ProductType;
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
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
    const p = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      select: PUBLIC_FIELDS,
    });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  private async assertSkuUnique(
    tx: Prisma.TransactionClient,
    companyId: string,
    sku: string,
    excludeId?: string,
  ) {
    const existing = await tx.product.findFirst({
      where: {
        companyId,
        sku,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('SKU already exists in this company');
  }

  private async assertBarcodeUnique(
    tx: Prisma.TransactionClient,
    companyId: string,
    barcode: string | null | undefined,
    excludeId?: string,
  ) {
    if (!barcode) return;
    const existing = await tx.product.findFirst({
      where: {
        companyId,
        barcode,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Barcode already exists in this company');
  }

  async create(companyId: string, dto: CreateProductDto, actorUserId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertSkuUnique(tx, companyId, dto.sku);
      await this.assertBarcodeUnique(tx, companyId, dto.barcode);
      return tx.product.create({
        data: {
          companyId,
          sku: dto.sku,
          name: dto.name,
          nameAr: dto.nameAr,
          description: dto.description,
          type: dto.type,
          barcode: dto.barcode ?? null,
          unit: dto.unit,
          priceBeforeVat: dto.priceBeforeVat ?? null,
          vatRate: dto.vatRate ?? '15.00',
          isActive: dto.isActive ?? true,
          createdById: actorUserId,
          updatedById: actorUserId,
        } as Prisma.ProductUncheckedCreateInput,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'products.created',
      entity: 'Product',
      entityId: created.id,
      metadata: { sku: created.sku, type: created.type },
    });

    return created;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateProductDto,
    actorUserId: string,
  ) {
    const current = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Product not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.sku !== undefined) {
        await this.assertSkuUnique(tx, companyId, dto.sku, id);
      }
      if (dto.barcode !== undefined) {
        await this.assertBarcodeUnique(tx, companyId, dto.barcode, id);
      }

      const data: Prisma.ProductUpdateInput = { updatedBy: { connect: { id: actorUserId } } };
      if (dto.sku !== undefined) data.sku = dto.sku;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.barcode !== undefined) data.barcode = dto.barcode ?? null;
      if (dto.unit !== undefined) data.unit = dto.unit;
      if (dto.priceBeforeVat !== undefined) {
        data.priceBeforeVat = dto.priceBeforeVat ?? null;
      }
      if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      return tx.product.update({
        where: { id },
        data,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'products.updated',
      entity: 'Product',
      entityId: id,
    });

    return updated;
  }

  async remove(companyId: string, id: string, actorUserId: string) {
    const current = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Product not found');

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: { connect: { id: actorUserId } } },
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'products.deleted',
      entity: 'Product',
      entityId: id,
    });

    return { id, isActive: false };
  }
}
