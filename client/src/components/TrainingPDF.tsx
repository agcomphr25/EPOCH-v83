import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 30,
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
  },
  companyName: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1F2937',
  },
  question: {
    marginBottom: 15,
  },
  questionText: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#374151',
  },
  option: {
    fontSize: 10,
    marginLeft: 15,
    marginBottom: 3,
    color: '#4B5563',
  },
  answerKey: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#9CA3AF',
  },
  answerKeyTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1F2937',
  },
  answerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  answerItem: {
    width: '33%',
    fontSize: 10,
    marginBottom: 5,
    color: '#374151',
  },
  attendanceSection: {
    marginTop: 20,
  },
  attendanceInfo: {
    marginBottom: 15,
  },
  infoLine: {
    fontSize: 10,
    marginBottom: 8,
    color: '#374151',
  },
  signatureTable: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#D1D5DB',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#D1D5DB',
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#E5E7EB',
    minHeight: 30,
  },
  tableCell: {
    flex: 1,
    fontSize: 10,
    color: '#6B7280',
  },
});

interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

interface TrainingPDFProps {
  title: string;
  companyName: string;
  questions?: Question[];
  includeAnswerKey?: boolean;
  isAttendance?: boolean;
  attendeeCount?: number;
  content?: string[];
}

// Quiz PDF Document Component
const QuizPDFDocument = ({ title, companyName, questions = [], includeAnswerKey = true }: TrainingPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Responsive • Reliable • Supportive</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Training Assessment</Text>
        <Text style={{ fontSize: 10, marginBottom: 15, color: '#6B7280' }}>
          Please complete this assessment to demonstrate understanding. Circle the correct answer for each question.
        </Text>
        
        {questions.map((question, index) => (
          <View key={question.id} style={styles.question}>
            <Text style={styles.questionText}>
              {index + 1}. {question.question}
            </Text>
            {question.options.map((option) => (
              <Text key={option} style={styles.option}>
                {option}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {includeAnswerKey && questions.length > 0 && (
        <View style={styles.answerKey}>
          <Text style={styles.answerKeyTitle}>Answer Key (For Instructor Use Only)</Text>
          <View style={styles.answerGrid}>
            {questions.map((question, index) => (
              <Text key={question.id} style={styles.answerItem}>
                {index + 1}. {question.correctAnswer}) {question.options.find(opt => opt.charAt(0) === question.correctAnswer)?.substring(3)}
              </Text>
            ))}
          </View>
        </View>
      )}
    </Page>
  </Document>
);

// Content PDF Document Component
const ContentPDFDocument = ({ title, companyName, content = [] }: TrainingPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Responsive • Reliable • Supportive</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Training Content</Text>
        {content.map((paragraph, index) => (
          <Text key={index} style={{ fontSize: 10, marginBottom: 8, color: '#374151' }}>
            {paragraph}
          </Text>
        ))}
      </View>
    </Page>
  </Document>
);

// Attendance PDF Document Component
const AttendancePDFDocument = ({ title, companyName, attendeeCount = 15 }: TrainingPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Responsive • Reliable • Supportive</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Training Attendance Record</Text>
        <Text style={{ fontSize: 10, marginBottom: 15, color: '#6B7280' }}>
          All attendees must sign below to confirm participation in the training session.
        </Text>
        
        <View style={styles.attendanceInfo}>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Topic:</Text> {title.replace(' - Attendance', '')}</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Date:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Duration:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Location:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Instructor:</Text> ___________________</Text>
        </View>

        <View style={styles.signatureTable}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>#</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Employee Name (Print)</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Employee Signature</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Department</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Date</Text>
          </View>
          
          {Array.from({ length: attendeeCount }, (_, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>{index + 1}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}></Text>
              <Text style={[styles.tableCell, { flex: 3 }]}></Text>
              <Text style={[styles.tableCell, { flex: 2 }]}></Text>
              <Text style={[styles.tableCell, { flex: 2 }]}></Text>
            </View>
          ))}
        </View>
      </View>
    </Page>
  </Document>
);

// Export functions to generate and download PDFs
export const generateQuizPDF = async (props: TrainingPDFProps) => {
  const doc = <QuizPDFDocument {...props} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  const filename = `${props.title.replace(/[^a-zA-Z0-9]/g, '_')}_Quiz_${new Date().toISOString().split('T')[0]}.pdf`;
  saveAs(blob, filename);
};

export const generateContentPDF = async (props: TrainingPDFProps) => {
  const doc = <ContentPDFDocument {...props} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  const filename = `${props.title.replace(/[^a-zA-Z0-9]/g, '_')}_Content_${new Date().toISOString().split('T')[0]}.pdf`;
  saveAs(blob, filename);
};

// Combined PDF Document Component (Quiz/Content + Attendance)
const CombinedPDFDocument = ({ title, companyName, questions = [], content = [], includeAnswerKey = true, attendeeCount = 15 }: TrainingPDFProps) => (
  <Document>
    {/* First Page - Quiz/Content */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Responsive • Reliable • Supportive</Text>
      </View>

      {questions.length > 0 ? (
        /* Quiz Content */
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Assessment</Text>
          <Text style={{ fontSize: 10, marginBottom: 15, color: '#6B7280' }}>
            Please complete this assessment to demonstrate understanding. Circle the correct answer for each question.
          </Text>
          
          {questions.map((question, index) => (
            <View key={question.id} style={styles.question}>
              <Text style={styles.questionText}>
                {index + 1}. {question.question}
              </Text>
              {question.options.map((option) => (
                <Text key={option} style={styles.option}>
                  {option}
                </Text>
              ))}
            </View>
          ))}

          {includeAnswerKey && (
            <View style={styles.answerKey}>
              <Text style={styles.answerKeyTitle}>Answer Key (For Instructor Use Only)</Text>
              <View style={styles.answerGrid}>
                {questions.map((question, index) => (
                  <Text key={question.id} style={styles.answerItem}>
                    {index + 1}. {question.correctAnswer}) {question.options.find(opt => opt.charAt(0) === question.correctAnswer)?.substring(3)}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>
      ) : (
        /* Content Only */
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Content</Text>
          {content.map((paragraph, index) => (
            <Text key={index} style={{ fontSize: 10, marginBottom: 8, color: '#374151' }}>
              {paragraph}
            </Text>
          ))}
        </View>
      )}
    </Page>

    {/* Second Page - Attendance */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.companyName}>{companyName}</Text>
        <Text style={styles.title}>{title.replace(' - Assessment', ' - Attendance').replace(' - Content', ' - Attendance')}</Text>
        <Text style={styles.subtitle}>Responsive • Reliable • Supportive</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Training Attendance Record</Text>
        <Text style={{ fontSize: 10, marginBottom: 15, color: '#6B7280' }}>
          All attendees must sign below to confirm participation in the training session.
        </Text>
        
        <View style={styles.attendanceInfo}>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Topic:</Text> {title.replace(' - Assessment', '').replace(' - Content', '').replace(' - Attendance', '')}</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Date:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Duration:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Training Location:</Text> ___________________</Text>
          <Text style={styles.infoLine}><Text style={{ fontWeight: 'bold' }}>Instructor:</Text> ___________________</Text>
        </View>

        <View style={styles.signatureTable}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>#</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Employee Name (Print)</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Employee Signature</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Department</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Date</Text>
          </View>
          
          {Array.from({ length: attendeeCount }, (_, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>{index + 1}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}></Text>
              <Text style={[styles.tableCell, { flex: 3 }]}></Text>
              <Text style={[styles.tableCell, { flex: 2 }]}></Text>
              <Text style={[styles.tableCell, { flex: 2 }]}></Text>
            </View>
          ))}
        </View>
      </View>
    </Page>
  </Document>
);

export const generateCombinedPDF = async (props: TrainingPDFProps) => {
  const doc = <CombinedPDFDocument {...props} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  const filename = `${props.title.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_${new Date().toISOString().split('T')[0]}.pdf`;
  saveAs(blob, filename);
};

export const generateAttendancePDF = async (props: TrainingPDFProps) => {
  const doc = <AttendancePDFDocument {...props} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  const filename = `${props.title.replace(/[^a-zA-Z0-9]/g, '_')}_Attendance_${new Date().toISOString().split('T')[0]}.pdf`;
  saveAs(blob, filename);
};