// =====================================================
// PartnersService — CRUD strictly scoped by companyId from JWT.
// NEVER accepts companyId from input. Soft-delete via deletedAt.
// Dup-detection: code (NULL distinct), vatNumber (NULL distinct).
// =====================================================
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PartnerType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnerQueryDto } from './dto/partner-query.dto';

const PUBLIC_FIELDS = {
  id: true,
  companyId: true,
  code: true,
  name: true,
  nameAr: true,
  type: true,
  vatNumber: true,
  commercialRegistration: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  country: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: PartnerQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.PartnerWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (q.search) {
      const s = q.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { code: { contains: s, mode: 'insensitive' } },
        { vatNumber: { contains: s } },
        { phone: { contains: s } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.type) where.type = q.type as PartnerType;
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.partner.count({ where }),
      this.prisma.partner.findMany({
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
    const p = await this.prisma.partner.findFirst({
      where: { id, companyId, deletedAt: null },
      select: PUBLIC_FIELDS,
    });
    if (!p) throw new NotFoundException('Partner not found');
    return p;
  }

  private async assertCodeUnique(
    tx: Prisma.TransactionClient,
    companyId: string,
    code: string | null | undefined,
    excludeId?: string,
  ) {
    if (!code) return;
    const existing = await tx.partner.findFirst({
      where: {
        companyId,
        code,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Code already exists in this company');
  }

  private async assertVatUnique(
    tx: Prisma.TransactionClient,
    companyId: string,
    vatNumber: string | null | undefined,
    excludeId?: string,
  ) {
    if (!vatNumber) return;
    const existing = await tx.partner.findFirst({
      where: {
        companyId,
        vatNumber,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('VAT number already exists in this company');
  }

  async create(companyId: string, dto: CreatePartnerDto, actorUserId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertCodeUnique(tx, companyId, dto.code);
      await this.assertVatUnique(tx, companyId, dto.vatNumber);
      return tx.partner.create({
        data: {
          companyId,
          code: dto.code ?? null,
          name: dto.name,
          nameAr: dto.nameAr,
          type: dto.type,
          vatNumber: dto.vatNumber ?? null,
          commercialRegistration: dto.commercialRegistration,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          country: dto.country ?? 'SA',
          isActive: dto.isActive ?? true,
          createdById: actorUserId,
          updatedById: actorUserId,
        } as Prisma.PartnerUncheckedCreateInput,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'partners.created',
      entity: 'Partner',
      entityId: created.id,
      metadata: { name: created.name, type: created.type },
    });

    return created;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdatePartnerDto,
    actorUserId: string,
  ) {
    const current = await this.prisma.partner.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Partner not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.code !== undefined) {
        await this.assertCodeUnique(tx, companyId, dto.code, id);
      }
      if (dto.vatNumber !== undefined) {
        await this.assertVatUnique(tx, companyId, dto.vatNumber, id);
      }

      const data: Prisma.PartnerUpdateInput = { updatedBy: { connect: { id: actorUserId } } };
      if (dto.code !== undefined) data.code = dto.code ?? null;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber ?? null;
      if (dto.commercialRegistration !== undefined) data.commercialRegistration = dto.commercialRegistration;
      if (dto.email !== undefined) data.email = dto.email;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.address !== undefined) data.address = dto.address;
      if (dto.city !== undefined) data.city = dto.city;
      if (dto.country !== undefined) data.country = dto.country;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      return tx.partner.update({
        where: { id },
        data,
        select: PUBLIC_FIELDS,
      });
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'partners.updated',
      entity: 'Partner',
      entityId: id,
    });

    return updated;
  }

  async remove(companyId: string, id: string, actorUserId: string) {
    const current = await this.prisma.partner.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Partner not found');

    await this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: { connect: { id: actorUserId } } },
    });

    await this.audit.record({
      companyId,
      userId: actorUserId,
      action: 'partners.deleted',
      entity: 'Partner',
      entityId: id,
    });

    return { id, isActive: false };
  }
}
