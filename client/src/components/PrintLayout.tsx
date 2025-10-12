interface PrintLayoutProps {
  title: string;
  companyName?: string;
  children: React.ReactNode;
  includeSignatures?: boolean;
  attendeeCount?: number;
}

interface SignatureTableProps {
  attendeeCount?: number;
  includeDate?: boolean;
  title?: string;
}

export function SignatureTable({
  attendeeCount = 10,
  includeDate = true,
  title = 'Training Attendance',
}: SignatureTableProps) {
  const rows = Array.from({ length: attendeeCount }, (_, i) => i + 1);

  return (
    <div className="mt-8 break-inside-avoid">
      <h3 className="text-lg font-bold mb-4 print:text-black">{title}</h3>
      <table className="w-full border-collapse border border-gray-800 print:border-black">
        <thead>
          <tr className="bg-gray-100 print:bg-white">
            <th className="border border-gray-800 print:border-black p-2 text-left w-8">
              #
            </th>
            <th className="border border-gray-800 print:border-black p-2 text-left">
              Employee Name (Print)
            </th>
            <th className="border border-gray-800 print:border-black p-2 text-left">
              Signature
            </th>
            {includeDate && (
              <th className="border border-gray-800 print:border-black p-2 text-left w-24">
                Date
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="border border-gray-800 print:border-black p-2 h-10 print:h-12">
                {row}
              </td>
              <td className="border border-gray-800 print:border-black p-2 h-10 print:h-12"></td>
              <td className="border border-gray-800 print:border-black p-2 h-10 print:h-12"></td>
              {includeDate && (
                <td className="border border-gray-800 print:border-black p-2 h-10 print:h-12"></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintLayout({
  title,
  companyName = 'AG Advanced Technologies LLC',
  children,
  includeSignatures = true,
  attendeeCount = 10,
}: PrintLayoutProps) {
  return (
    <div className="print-content max-w-none print:max-w-none print:shadow-none print:border-none print:bg-white print:text-black print:text-sm">
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
            font-size: 12pt !important;
            line-height: 1.4 !important;
          }
          
          .print-content {
            margin: 0.5in;
            padding: 0;
            background: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
          }
          
          .print-hide {
            display: none !important;
          }
          
          .print-show {
            display: block !important;
          }
          
          h1, h2, h3, h4, h5, h6 {
            color: black !important;
            margin: 16pt 0 8pt 0;
            page-break-after: avoid;
          }
          
          h1 {
            font-size: 18pt !important;
            font-weight: bold !important;
          }
          
          h2 {
            font-size: 16pt !important;
            font-weight: bold !important;
          }
          
          h3 {
            font-size: 14pt !important;
            font-weight: bold !important;
          }
          
          p, li, td, th {
            color: black !important;
            font-size: 11pt !important;
            line-height: 1.4 !important;
          }
          
          ul, ol {
            margin: 8pt 0;
            padding-left: 24pt;
          }
          
          table {
            border-collapse: collapse !important;
            width: 100% !important;
            margin: 12pt 0 !important;
          }
          
          th, td {
            border: 1pt solid black !important;
            padding: 4pt 6pt !important;
            text-align: left !important;
          }
          
          th {
            background-color: #f5f5f5 !important;
            font-weight: bold !important;
          }
          
          .page-break {
            page-break-before: always;
          }
          
          .break-inside-avoid {
            page-break-inside: avoid;
          }
          
          .signature-line {
            border-bottom: 1pt solid black !important;
            min-height: 20pt !important;
            display: inline-block !important;
            width: 200pt !important;
          }
        }
        
        @page {
          size: letter;
          margin: 0.5in;
        }
      `}</style>

      {/* Header */}
      <div className="text-center mb-6 print:mb-8 border-b-2 border-gray-200 print:border-black pb-4">
        <div className="text-sm text-gray-600 print:text-black mb-1">
          {companyName}
        </div>
        <h1 className="text-xl font-bold print:text-black print:text-2xl">
          {title}
        </h1>
        <div className="text-sm text-gray-500 print:text-black mt-2">
          Date: _________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Instructor:
          _________________
        </div>
      </div>

      {/* Content */}
      <div className="print:text-black">{children}</div>

      {/* Signature Section */}
      {includeSignatures && (
        <>
          <div className="page-break"></div>
          <SignatureTable attendeeCount={attendeeCount} />

          <div className="mt-8 break-inside-avoid">
            <h3 className="text-lg font-bold mb-4 print:text-black">
              Instructor Certification
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 print:text-black">
                  I certify that this training was conducted in accordance with
                  company procedures and all attendees demonstrated
                  understanding of the material.
                </label>
                <div className="flex items-center space-x-8 mt-4">
                  <div>
                    <div className="signature-line mb-1"></div>
                    <div className="text-xs print:text-black text-center">
                      Instructor Signature
                    </div>
                  </div>
                  <div>
                    <div className="signature-line mb-1"></div>
                    <div className="text-xs print:text-black text-center">
                      Date
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium mb-2 print:text-black">
                  Instructor Name (Print):
                  ________________________________________________
                </label>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2 print:text-black">
                  Training Location:
                  ________________________________________________
                </label>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
