import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useExportReportMutation, type ExportReportType, type ReportFilterParams } from '@/lib/api/reports';

interface ExportCsvButtonProps {
  type: ExportReportType;
  params: ReportFilterParams;
}

export function ExportCsvButton({ type, params }: ExportCsvButtonProps) {
  const { mutateAsync, isPending } = useExportReportMutation();

  const handleExport = async () => {
    try {
      const { blob, filename } = await mutateAsync({ type, params });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export report');
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={isPending} className="gap-2">
      <Download className="h-4 w-4" />
      {isPending ? 'Exporting...' : 'Export CSV'}
    </Button>
  );
}
