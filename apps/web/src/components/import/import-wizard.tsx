'use client';

import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import {
  useImportEntities,
  useParseImport,
  useSaveMapping,
  useSaveMappingTemplate,
  useValidateImport,
  useExecuteImport,
  useCancelImport,
  useImportDetail,
} from '@/hooks/use-imports';
import type {
  ParseResult,
  ValidateResult,
  DuplicateStrategy,
  ColumnMapping,
} from '@/lib/api/imports';
import { importsAPI, downloadBlob } from '@/lib/api/imports';
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Download,
  Loader2,
  XCircle,
  Save,
} from 'lucide-react';
import { describeError } from '@/lib/api/describe-error';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'mapping' | 'preview' | 'execute' | 'complete';

/// Radix Select reserves the empty string, so "leave this column out" needs a
/// value of its own; it is never sent to the server.
const SKIP_COLUMN = '__skip__';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'mapping', label: 'Match columns' },
  { key: 'preview', label: 'Review' },
  { key: 'execute', label: 'Confirm' },
  { key: 'complete', label: 'Done' },
];

export function ImportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [entityType, setEntityType] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('SKIP');
  const [sessionId, setSessionId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');

  const { data: entitiesData } = useImportEntities();
  const parseMutation = useParseImport();
  const saveMappingMutation = useSaveMapping();
  const saveTemplateMutation = useSaveMappingTemplate();
  const validateMutation = useValidateImport();
  const executeMutation = useExecuteImport();
  const cancelMutation = useCancelImport();

  // Only polls once execution starts — see useImportDetail's refetchInterval.
  const { data: liveSession } = useImportDetail(
    step === 'complete' && sessionId ? sessionId : null,
  );

  const entities = entitiesData?.items ?? [];
  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  const handleUpload = useCallback(async () => {
    if (!file || !entityType) return;
    try {
      const result = await parseMutation.mutateAsync({ file, entityType });
      setParseResult(result);
      setSessionId(result.sessionId);
      setMapping(result.defaultMapping);
      setStep('mapping');
    } catch (err) {
      toast.error(describeError(err, 'Upload failed'));
    }
  }, [file, entityType, parseMutation]);

  /// Saves the mapping BEFORE validating.
  ///
  /// The wizard used to collect this state and never send it — validation ran
  /// against the server's auto-detected guess, so every manual mapping choice
  /// the user made was silently discarded.
  const handleValidate = useCallback(async () => {
    if (!sessionId) return;
    try {
      await saveMappingMutation.mutateAsync({ sessionId, columnMapping: mapping });
      const result = await validateMutation.mutateAsync(sessionId);
      setValidateResult(result);
      setStep('preview');
    } catch (err) {
      toast.error(describeError(err, 'Validation failed'));
    }
  }, [sessionId, mapping, saveMappingMutation, validateMutation]);

  const handleSaveTemplate = useCallback(async () => {
    if (!sessionId || !templateName.trim()) return;
    try {
      await saveTemplateMutation.mutateAsync({
        sessionId, name: templateName.trim(), columnMapping: mapping,
      });
      toast.success(`Mapping saved as "${templateName.trim()}"`);
      setTemplateName('');
    } catch (err) {
      toast.error(describeError(err, 'Failed to save mapping'));
    }
  }, [sessionId, templateName, mapping, saveTemplateMutation]);

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = parseResult?.savedTemplates.find((t) => t.id === templateId);
      if (!template || !parseResult) return;
      // Templates are keyed by header text so they survive a reordered export;
      // project them back onto this file's column positions.
      const next: ColumnMapping = {};
      parseResult.headers.forEach((header, i) => {
        const field = template.mapping[header];
        if (field) next[String(i)] = field;
      });
      setMapping(next);
      toast.success(`Applied mapping "${template.name}"`);
    },
    [parseResult],
  );

  const handleExecute = useCallback(async () => {
    if (!sessionId) return;
    try {
      await executeMutation.mutateAsync({ sessionId, duplicateStrategy });
      // Execution is asynchronous: this only means "accepted". The complete
      // step polls for the real outcome rather than claiming success here.
      setStep('complete');
    } catch (err) {
      toast.error(describeError(err, 'Execution failed'));
    }
  }, [sessionId, duplicateStrategy, executeMutation]);

  const handleCancel = useCallback(async () => {
    if (!sessionId) return;
    try {
      await cancelMutation.mutateAsync(sessionId);
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(describeError(err, 'Failed to cancel'));
    }
  }, [sessionId, cancelMutation]);

  const handleDownloadTemplate = async () => {
    if (!entityType) return;
    try {
      downloadBlob(await importsAPI.downloadTemplate(entityType), `${entityType.toLowerCase()}-import-template.csv`);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleDownloadErrors = async () => {
    if (!sessionId) return;
    try {
      downloadBlob(await importsAPI.downloadErrors(sessionId), `import-errors-${sessionId.slice(0, 8)}.csv`);
    } catch {
      toast.error('Failed to Download error report');
    }
  };

  const resetWizard = () => {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setValidateResult(null);
    setMapping({});
    setSessionId('');
  };

  const requiredFields = parseResult?.columnDefinitions.filter((c) => c.required) ?? [];
  const mappedValues = Object.values(mapping);
  const missingRequired = requiredFields.filter((f) => !mappedValues.includes(f.fieldName));
  const allRequiredMapped = missingRequired.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data import"
        subtitle={`Import ${entityType ? entityType.toLowerCase() + 's' : 'data'} from a CSV or Excel file`}
      />

      <div className="rounded-lg border border-brand/10 bg-surface p-6">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  i < currentStepIndex
                    ? 'bg-success text-success-foreground'
                    : i === currentStepIndex
                      ? 'bg-brand text-brand-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStepIndex ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm ${i === currentStepIndex ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className="mx-2 h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="max-w-sm space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="entity-type">
                What are you importing?
              </label>
              {/* Built from the registry, filtered by role server-side — so this
                  never offers an entity the user would be 403'd on. */}
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger id="entity-type">
                  <SelectValue placeholder="Choose customers, orders, vehicles…" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.entityType} value={e.entityType}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {entityType ? (
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs text-brand underline-offset-4 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Download a template with the right columns
                </button>
              ) : null}
            </div>

            <FileField file={file} onSelect={setFile} />

            <Button
              onClick={handleUpload}
              disabled={!file || !entityType || parseMutation.isPending}
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
            >
              {parseMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reading the file…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Continue</>
              )}
            </Button>
          </div>
        )}

        {step === 'mapping' && parseResult && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium text-foreground">Match columns</h3>
                <p className="text-sm text-muted-foreground">
                  Tell us which column in your file holds which piece of information.
                  Fields marked * are required.
                </p>
              </div>
              <Badge variant="brand">{parseResult.totalRows.toLocaleString()} rows detected</Badge>
            </div>

            {parseResult.savedTemplates.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" htmlFor="saved-mapping">Saved mapping</label>
                <Select value="" onValueChange={applyTemplate}>
                  <SelectTrigger id="saved-mapping" className="h-8 w-56">
                    <SelectValue placeholder="Reuse a saved mapping…" />
                  </SelectTrigger>
                  <SelectContent>
                    {parseResult.savedTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-brand/10">
              <Table aria-label="Column mapping">
                <TableHeader>
                  <TableRow>
                    <TableHead>Column in your file</TableHead>
                    <TableHead className="hidden sm:table-cell">Example</TableHead>
                    <TableHead>Imports as</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parseResult.headers.map((header, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm font-medium">{header}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {parseResult.preview[0]?.[header]
                          ? String(parseResult.preview[0][header]).slice(0, 50)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Select
                          value={mapping[String(idx)] ?? SKIP_COLUMN}
                          onValueChange={(value) =>
                            setMapping((prev) => {
                              const next = { ...prev };
                              if (value === SKIP_COLUMN) delete next[String(idx)];
                              else next[String(idx)] = value;
                              return next;
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-full" aria-label={`Match column ${header}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP_COLUMN}>Don&rsquo;t import this column</SelectItem>
                            {parseResult.columnDefinitions.map((def) => (
                              <SelectItem key={def.fieldName} value={def.fieldName}>
                                {def.label}{def.required ? ' *' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!allRequiredMapped && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Not yet mapped: {missingRequired.map((f) => f.label).join(', ')}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Save this mapping as..."
                className="max-w-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || saveTemplateMutation.isPending}
                className="gap-2"
              >
                <Save className="h-3 w-3" />
                Save Mapping
              </Button>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleValidate}
                disabled={!allRequiredMapped || validateMutation.isPending || saveMappingMutation.isPending}
              >
                {validateMutation.isPending || saveMappingMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validating...</>
                ) : (
                  <><ArrowRight className="mr-2 h-4 w-4" />Check the rows</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && validateResult && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium text-foreground">Review</h3>
                <p className="text-sm text-muted-foreground">
                  Review what will happen before committing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{validateResult.validRows} valid</Badge>
                {validateResult.invalidRows > 0 && (
                  <Badge variant="danger">{validateResult.invalidRows} invalid</Badge>
                )}
                {validateResult.warnings > 0 && (
                  <Badge variant="outline">{validateResult.warnings} warnings</Badge>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile label="New records" value={validateResult.newRecords} />
              <SummaryTile label="Existing (duplicates)" value={validateResult.duplicates} />
              <SummaryTile label="Will be skipped" value={validateResult.invalidRows} />
              <SummaryTile label="Est. time" value={`~${validateResult.estimatedSeconds}s`} />
            </div>

            {validateResult.ignoredColumns.length > 0 && (
              <div className="rounded-lg border border-brand/10 bg-surface p-3 text-sm text-muted-foreground">
                Ignored columns (not mapped): {validateResult.ignoredColumns.join(', ')}
              </div>
            )}

            {validateResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-destructive">
                    {validateResult.errors.length} issue(s) found
                  </p>
                  <Button variant="outline" size="sm" onClick={handleDownloadErrors} className="gap-2">
                    <Download className="h-3 w-3" />Download full report
                  </Button>
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto text-xs">
                  {validateResult.errors.slice(0, 20).map((err, i) => (
                    <div key={i} className={err.severity === 'WARNING' ? 'text-warning' : 'text-destructive/80'}>
                      Row {err.row}: {err.message}{err.column ? ` (${err.column})` : ''}
                    </div>
                  ))}
                  {validateResult.errors.length > 20 && (
                    <div className="mt-1 text-muted-foreground">
                      ...and {validateResult.errors.length - 20} more — download the report for all of them
                    </div>
                  )}
                </div>
              </div>
            )}

            {validateResult.preview.valid.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-brand/10">
                <Table aria-label="Rows that passed validation">
                  <TableHeader>
                    <TableRow>
                      {Object.keys(validateResult.preview.valid[0]).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validateResult.preview.valid.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((val, j) => (
                          <TableCell key={j} className="text-sm">
                            {val === null || val === undefined ? '—' : String(val).slice(0, 40)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => setStep('execute')}
                disabled={validateResult.validRows === 0}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                <ArrowRight className="mr-2 h-4 w-4" />Continue
              </Button>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
            </div>
          </div>
        )}

        {step === 'execute' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Start import</h3>
              <p className="text-sm text-muted-foreground">
                {validateResult?.validRows ?? 0} rows will be processed.
                {(validateResult?.invalidRows ?? 0) > 0 &&
                  ` ${validateResult?.invalidRows} invalid row(s) will be skipped.`}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">If a record already exists</label>
              <div className="mt-2 space-y-2">
                {([
                  { value: 'SKIP', label: 'Skip duplicates', desc: 'Leave existing records untouched' },
                  { value: 'UPDATE', label: 'Update duplicates', desc: 'Overwrite existing records with the file’s values' },
                  { value: 'ERROR', label: 'Fail on duplicates', desc: 'Abort the whole import if any row already exists' },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      duplicateStrategy === opt.value ? 'border-brand bg-brand/5' : 'border-border hover:bg-surface-hover'
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicateStrategy"
                      value={opt.value}
                      checked={duplicateStrategy === opt.value}
                      onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {(validateResult?.duplicates ?? 0) > 0 && (
                <p className="mt-2 text-xs text-warning">
                  {validateResult?.duplicates} row(s) match existing records and will be handled this way.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleExecute}
                disabled={executeMutation.isPending}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              >
                {executeMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                ) : (
                  <><CheckCircle className="mr-2 h-4 w-4" />Start import</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep('preview')}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <ExecutionResult
            session={liveSession}
            onCancel={handleCancel}
            cancelling={cancelMutation.isPending}
            onDownloadErrors={handleDownloadErrors}
            onViewHistory={() => navigate({ to: '/app/import/history' })}
            onImportAnother={resetWizard}
          />
        )}
      </div>
    </div>
  );
}

/// The live outcome of an asynchronous import.
///
/// This used to declare "Import completed successfully" the instant execute was
/// accepted — before a single row had been written, and regardless of whether it
/// then failed. It now reports what actually happened, polled from the server.
function ExecutionResult({
  session, onCancel, cancelling, onDownloadErrors, onViewHistory, onImportAnother,
}: {
  session: import('@/lib/api/imports').ImportSession | null;
  onCancel: () => void;
  cancelling: boolean;
  onDownloadErrors: () => void;
  onViewHistory: () => void;
  onImportAnother: () => void;
}) {
  if (!session) {
    return (
      <div className="flex items-center gap-3 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">Starting import...</p>
      </div>
    );
  }

  const running = session.status === 'EXECUTING';
  const percent = session.totalRows > 0
    ? Math.round((session.processedRows / session.totalRows) * 100)
    : 0;

  if (running) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {session.cancelRequested ? 'Cancelling...' : 'Import in progress'}
            </p>
            <p className="text-xs text-muted-foreground">
              {session.processedRows.toLocaleString()} of {session.totalRows.toLocaleString()} rows ({percent}%)
            </p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling || session.cancelRequested}>
          <XCircle className="mr-2 h-4 w-4" />
          {session.cancelRequested ? 'Cancelling...' : 'Cancel import'}
        </Button>
      </div>
    );
  }

  const failed = session.status === 'FAILED';
  const cancelled = session.status === 'CANCELLED';

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center">
        <div className={`rounded-full p-3 ${failed ? 'bg-destructive/10' : cancelled ? 'bg-warning/10' : 'bg-success/10'}`}>
          {failed ? (
            <XCircle className="h-8 w-8 text-destructive" />
          ) : cancelled ? (
            <AlertTriangle className="h-8 w-8 text-warning" />
          ) : (
            <CheckCircle className="h-8 w-8 text-success" />
          )}
        </div>
        <h3 className="mt-4 font-medium text-foreground">
          {failed ? 'Import failed' : cancelled ? 'Import cancelled' : 'Import complete'}
        </h3>
        {session.errorMessage && (
          <p className="mt-1 max-w-lg text-sm text-destructive">{session.errorMessage}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile label="Imported" value={session.successfulRows} tone="success" />
        <SummaryTile label="Updated" value={session.updatedRows} tone="success" />
        <SummaryTile label="Skipped" value={session.skippedRows} />
        <SummaryTile label="Failed" value={session.failedRows} tone={session.failedRows > 0 ? 'danger' : undefined} />
        <SummaryTile
          label="Duration"
          value={session.executionMs !== null ? `${(session.executionMs / 1000).toFixed(1)}s` : '—'}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {(session.failedRows > 0 || session.invalidRows > 0) && (
          <Button variant="outline" onClick={onDownloadErrors} className="gap-2">
            <Download className="h-4 w-4" />Download error report
          </Button>
        )}
        <Button onClick={onViewHistory} className="bg-gradient-brand text-brand-foreground hover:opacity-90">
          View import history
        </Button>
        <Button variant="outline" onClick={onImportAnother}>Import another file</Button>
      </div>
    </div>
  );
}

/// A file picker that looks like the rest of the product.
///
/// `<input type="file">` renders as OS chrome — on Windows a light-grey
/// "Choose File / No file chosen" button that ignores the dark theme entirely.
/// On the first screen of the import wizard that one control was enough to make
/// the page read as an internal tool, so the real input stays but is visually
/// hidden behind a styled drop zone.
function FileField({ file, onSelect }: { file: File | null; onSelect: (file: File | null) => void }) {
  const [dragging, setDragging] = useState(false);

  const take = (chosen: File | null) => {
    if (!chosen) return;
    onSelect(chosen);
  };

  return (
    <div className="max-w-sm space-y-1.5">
      <span className="text-sm font-medium text-foreground">File</span>
      <label
        htmlFor="import-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/40 hover:bg-surface-hover',
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        {file ? (
          <>
            <span className="text-sm font-medium text-foreground">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB — click to choose a different file
            </span>
          </>
        ) : (
          <>
            <span className="text-sm text-foreground">Drop a file here, or click to browse</span>
            <span className="text-xs text-muted-foreground">CSV or Excel, up to 10 MB and 100,000 rows</span>
          </>
        )}
      </label>
      <input
        id="import-file"
        type="file"
        accept=".csv,.xlsx"
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function SummaryTile({
  label, value, tone,
}: { label: string; value: number | string; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${
        tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : 'text-foreground'
      }`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
