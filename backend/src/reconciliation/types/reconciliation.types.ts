// =====================================================
// Phase 13A: Reconciliation Types
// Interfaces for statement import and uploaded file handling.
// =====================================================

export interface UploadedCsvFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StatementImportResult {
  statementId: string;
  bankAccountId: string;
  fileHash: string;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  totalInflow: string;
  totalOutflow: string;
  startDate: string;
  endDate: string;
}
