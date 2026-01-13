import React, { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Container,
  Title,
  Card,
  Text,
  Button,
  Stack,
  Radio,
  Group,
  Textarea,
  Paper,
  Badge,
  Progress,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import { IconCheck, IconX, IconSend } from "@tabler/icons-react";

export default function TraineeQuiz() {
  const [, params] = useRoute("/quiz/:sessionId");
  const [, setLocation] = useLocation();
  const sessionId = params?.sessionId!;
  const [quiz, setQuiz] = useState<any>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  async function generate() {
    const r = await fetch(`/api/training/sessions/${sessionId}/quiz/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facilityTopicCode: "PPE" })
    });
    const data = await r.json();
    setQuiz(data);
    setQuizId(data.quizId);
  }

  async function submit() {
    if (!quizId) return;
    setSubmitting(true);
    const payload = {
      answers: quiz.questions.map((q: any) => ({
        questionId: q.id,
        answer: answers[q.id] ?? ""
      }))
    };
    const r = await fetch(`/api/training/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    setResult(data);
    setSubmitting(false);
    
    // Redirect to trainer dashboard after 3 seconds
    setTimeout(() => {
      setLocation("/trainer");
    }, 3000);
  }

  useEffect(() => { generate(); }, [sessionId]);

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = quiz?.questions?.length ?? 0;

  if (!quiz) {
    return (
      <Container size="md" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading quiz...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Card withBorder shadow="sm" mb="lg" p="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Daily Quiz</Title>
            <Text size="sm" c="dimmed">Answer all questions and submit</Text>
          </div>
          <Badge size="lg" variant="light">
            {answeredCount} / {totalQuestions} answered
          </Badge>
        </Group>
        <Progress 
          value={(answeredCount / totalQuestions) * 100} 
          size="sm" 
          mt="md" 
          radius="xl"
        />
      </Card>

      <Stack gap="md">
        {quiz.questions.map((q: any, idx: number) => (
          <Card key={q.id} withBorder shadow="xs">
            <Group gap="sm" mb="md">
              <Badge 
                size="lg" 
                circle 
                variant={answers[q.id] ? "filled" : "light"}
                color={answers[q.id] ? "teal" : "gray"}
              >
                {idx + 1}
              </Badge>
              <Text fw={600} style={{ flex: 1 }}>{q.question}</Text>
            </Group>

            {q.type === "MCQ" && (
              <Radio.Group
                value={answers[q.id] ?? ""}
                onChange={(value) => setAnswers(a => ({ ...a, [q.id]: value }))}
              >
                <Stack gap="xs" ml="xl">
                  {(q.meta?.choices ?? []).map((c: string) => (
                    <Radio key={c} value={c} label={c} />
                  ))}
                </Stack>
              </Radio.Group>
            )}

            {q.type === "TF" && (
              <Radio.Group
                value={answers[q.id] ?? ""}
                onChange={(value) => setAnswers(a => ({ ...a, [q.id]: value }))}
              >
                <Group gap="xl" ml="xl">
                  <Radio value="True" label="True" />
                  <Radio value="False" label="False" />
                </Group>
              </Radio.Group>
            )}

            {q.type === "SHORT" && (
              <Textarea
                ml="xl"
                placeholder="Type your answer..."
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                minRows={3}
              />
            )}
          </Card>
        ))}
      </Stack>

      <Card withBorder shadow="sm" mt="lg" p="lg">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {totalQuestions - answeredCount > 0 
              ? `${totalQuestions - answeredCount} question(s) remaining`
              : "All questions answered!"}
          </Text>
          <Button
            size="lg"
            leftSection={<IconSend size={20} />}
            onClick={submit}
            loading={submitting}
            disabled={result !== null}
          >
            Submit Quiz
          </Button>
        </Group>
      </Card>

      {result && (
        <Alert 
          mt="lg" 
          variant="light"
          color={result.quiz.passed ? "green" : "red"}
          icon={result.quiz.passed ? <IconCheck size={24} /> : <IconX size={24} />}
          title={result.quiz.passed ? "Congratulations! You Passed!" : "Not Passed - Review Required"}
        >
          <Stack gap="xs">
            <Text size="lg" fw={600}>
              Score: {result.quiz.score} / {result.quiz.total} ({Math.round((result.quiz.score / result.quiz.total) * 100)}%)
            </Text>
            <Text size="sm" c="dimmed">
              Passing score is 80%. {result.quiz.passed 
                ? "Great job on your training!"
                : "Please review the material and try again."}
            </Text>
            <Text size="sm" fw={500} c="blue">
              Returning to Trainer Dashboard in 3 seconds...
            </Text>
          </Stack>
        </Alert>
      )}
    </Container>
  );
}
