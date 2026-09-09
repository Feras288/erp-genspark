// Phase 6: Accounting Core — controller.
//
//   * Mounted under /api/accounting/accounts and /api/accounting/journal.
//   * companyId comes exclusively from JWT (currentUser.companyId).
//   * All endpoints RBAC-gated via @RequirePermissions.
//   * DRAFT-only mutations (update, post, cancel) on journal entries.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';
import { AccountingService } from './accounting.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountingQueryDto, JournalEntryQueryDto } from './dto/accounting-query.dto';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';
import { CancelJournalEntryDto } from './dto/cancel-journal-entry.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  // ===== Chart of Accounts =====

  @Get('accounts')
  @RequirePermissions('gl_accounts.read')
  listAccounts(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: AccountingQueryDto,
  ) {
    return this.svc.listAccounts(me.companyId, q);
  }

  @Get('accounts/:id')
  @RequirePermissions('accounting.read')
  getAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.getAccount(me.companyId, id);
  }

  @Post('accounts')
  @RequirePermissions('accounting.accounts.create')
  @HttpCode(201)
  createAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
  ) {
    return this.svc.createAccount(me.companyId, me.id, dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('accounting.accounts.update')
  updateAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.svc.updateAccount(me.companyId, id, me.id, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions('accounting.accounts.delete')
  removeAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.removeAccount(me.companyId, id, me.id);
  }

  // ===== Manual Journal Entries =====

  @Get('journal')
  @RequirePermissions('gl_journal.read')
  listJournalEntries(
    @CurrentUser() me: AuthenticatedUser,
    @Query() q: JournalEntryQueryDto,
  ) {
    return this.svc.listJournalEntries(me.companyId, q);
  }

  @Get('journal/:id')
  @RequirePermissions('accounting.read')
  getJournalEntry(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.getJournalEntry(me.companyId, id);
  }

  @Post('journal')
  @RequirePermissions('gl_journal.write')
  @HttpCode(201)
  createJournalEntry(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.svc.createJournalEntry(me.companyId, me.id, dto);
  }

  @Patch('journal/:id')
  @RequirePermissions('gl_journal.write')
  updateJournalEntry(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.svc.updateJournalEntry(me.companyId, id, me.id, dto);
  }

  @Post('journal/:id/post')
  @RequirePermissions('gl_journal.write')
  postJournalEntry(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PostJournalEntryDto,
  ) {
    return this.svc.postJournalEntry(me.companyId, id, me.id, dto);
  }

  @Post('journal/:id/cancel')
  @RequirePermissions('gl_journal.write')
  cancelJournalEntry(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelJournalEntryDto,
  ) {
    return this.svc.cancelJournalEntry(me.companyId, id, me.id, dto);
  }
}
