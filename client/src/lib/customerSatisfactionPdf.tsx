interface SurveyResponse {
  id: number;
  surveyId: number;
  surveyTitle: string;
  customerId: number;
  customerName: string;
  customerEmail?: string;
  orderId?: string;
  responses: Record<string, any>;
  overallSatisfaction?: number;
  npsScore?: number;
  aggregateScore?: number;
  responseTimeSeconds?: number;
  csrName?: string;
  isComplete: boolean;
  surveyDate?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Survey {
  id: string;
  title: string;
  description?: string;
  isActive: boolean;
  questions: any[];
  settings: any;
  createdAt: string;
  updatedAt: string;
}

const pdfStyles: Record<string, any> = {
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #333',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 3,
  },
  section: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    fontWeight: 'bold',
    width: '30%',
  },
  value: {
    width: '70%',
  },
  question: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  questionText: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  answer: {
    color: '#333',
    marginLeft: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#999',
    fontSize: 9,
  },
};

export async function generateSurveyResponsePDF(response: SurveyResponse, survey: Survey | null): Promise<Blob> {
  const { pdf, Document, Page, Text, View } = await import('@react-pdf/renderer');

  const doc = (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.title}>Customer Satisfaction Survey Response</Text>
          <Text style={pdfStyles.subtitle}>{response.surveyTitle}</Text>
          <Text style={pdfStyles.subtitle}>
            Submitted: {response.submittedAt ? new Date(response.submittedAt).toLocaleDateString() : 'N/A'}
          </Text>
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Customer Information</Text>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Name:</Text>
            <Text style={pdfStyles.value}>{response.customerName}</Text>
          </View>
          {response.customerEmail && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Email:</Text>
              <Text style={pdfStyles.value}>{response.customerEmail}</Text>
            </View>
          )}
          {response.orderId && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Order #:</Text>
              <Text style={pdfStyles.value}>{response.orderId}</Text>
            </View>
          )}
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Overall Scores</Text>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Aggregate Score:</Text>
            <Text style={pdfStyles.value}>{response.aggregateScore || 0}/50</Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>NPS Score:</Text>
            <Text style={pdfStyles.value}>{response.npsScore}/10</Text>
          </View>
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Survey Responses</Text>
          {survey?.questions.map((question: any, index: number) => {
            const answer = response.responses[question.id];
            if (!answer && answer !== 0) return null;
            return (
              <View key={question.id} style={pdfStyles.question}>
                <Text style={pdfStyles.questionText}>{index + 1}. {question.question}</Text>
                <Text style={pdfStyles.answer}>{typeof answer === 'number' ? `${answer}/10` : answer}</Text>
              </View>
            );
          })}
        </View>

        <Text style={pdfStyles.footer}>
          Generated on {new Date().toLocaleDateString()} - Customer Satisfaction Survey System
        </Text>
      </Page>
    </Document>
  );

  return pdf(doc).toBlob();
}
