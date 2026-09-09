// =====================================================
// Phase 13A-B-2: ReconciliationController
// Endpoints under /api/reconciliation
// Guarded with JwtAuthGuard, PermissionsGuard, and @RequirePermissions
// =====================================================
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';
import { ReconciliationService } from './reconciliation.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ImportStatementCsvDto } from './dto/import-statement-csv.dto';
import { GetSuggestionsQueryDto } from './dto/get-suggestions-query.dto';
import { UploadedCsvFile } from './types/reconciliation.types';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  @Get('bank-accounts')
  @RequirePermissions('reconciliation.read')
  listBankAccounts(@CurrentUser() me: AuthenticatedUser) {
    return this.svc.listBankAccounts(me.companyId);
  }

  @Post('bank-accounts')
  @RequirePermissions('reconciliation.write')
  @HttpCode(201)
  createBankAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.svc.createBankAccount(me.companyId, dto);
  }

  @Patch('bank-accounts/:id')
  @RequirePermissions('reconciliation.write')
  updateBankAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.svc.updateBankAccount(me.companyId, id, dto);
  }

  @Delete('bank-accounts/:id')
  @RequirePermissions('reconciliation.write')
  deleteBankAccount(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.deleteBankAccount(me.companyId, id);
  }

  @Post('statements/import-csv')
  @RequirePermissions('reconciliation.import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @HttpCode(201)
  importStatementCsv(
    @CurrentUser() me: AuthenticatedUser,
    @UploadedFile() file: UploadedCsvFile,
    @Body() dto: ImportStatementCsvDto,
    @Query('bankAccountId') queryBankAccountId?: string,
  ) {
    const bankAccountId = dto.bankAccountId || queryBankAccountId;
    return this.svc.importStatementCsv(me.companyId, me.id, file, bankAccountId, dto);
  }

  @Get('suggestions')
  @RequirePermissions('reconciliation.read')
  getSuggestions(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: GetSuggestionsQueryDto,
  ) {
    return this.svc.getMatchingSuggestions(me.companyId, query);
  }

  @Get('bank-transactions')
  @RequirePermissions('reconciliation.read')
  listBankTransactions(@CurrentUser() me: AuthenticatedUser) {
    return this.svc.listBankTransactions(me.companyId);
  }

  @Get('reports/unmatched')
  @RequirePermissions('reconciliation.read')
  unmatchedReport(@CurrentUser() me: AuthenticatedUser) {
    return this.svc.unmatchedReport(me.companyId);
  }
}
