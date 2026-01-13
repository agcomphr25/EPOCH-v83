import React, { useState } from "react";
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Paper,
  ThemeIcon,
  Accordion,
  List,
  Divider,
  Alert,
  Box,
  Grid,
  Table,
  Button,
  Radio,
  Progress,
} from "@mantine/core";
import {
  IconSchool,
  IconUsers,
  IconTarget,
  IconHeart,
  IconShieldCheck,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconBulb,
  IconMessageCircle,
  IconEye,
  IconHandStop,
  IconCertificate,
  IconStars,
  IconClipboardCheck,
  IconRefresh,
} from "@tabler/icons-react";

const trainerQuizQuestions = [
  {
    id: 1,
    question: "In Step 1 of the 4-Step Training Model, who performs the task?",
    options: ["A. Trainee performs, trainer watches", "B. Trainer performs and explains", "C. Both perform together", "D. Neither - it's theory only"],
    answer: "B",
    category: "4-Step Model"
  },
  {
    id: 2,
    question: "What does the 'S' stand for in the S-O-A coaching model?",
    options: ["A. Safety", "B. Standard", "C. Strength", "D. Supervision"],
    answer: "C",
    category: "S-O-A Coaching"
  },
  {
    id: 3,
    question: "Which step verifies trainee comprehension BEFORE hands-on execution?",
    options: ["A. Step 1", "B. Step 2", "C. Step 3", "D. Step 4"],
    answer: "B",
    category: "4-Step Model"
  },
  {
    id: 4,
    question: "What should a trainer do if a trainee cannot explain a critical point in Step 2?",
    options: ["A. Move forward anyway", "B. Skip to Step 4", "C. Return to Step 1", "D. End the training session"],
    answer: "C",
    category: "4-Step Model"
  },
  {
    id: 5,
    question: "Which of the following is a PROHIBITED behavior during training?",
    options: ["A. Immediate feedback", "B. Public embarrassment", "C. Hip-to-hip shadowing", "D. Asking questions"],
    answer: "B",
    category: "Prohibited Behaviors"
  },
  {
    id: 6,
    question: "In the S-O-A model, how should mistakes be framed?",
    options: ["A. As failures requiring discipline", "B. As learning opportunities", "C. As reasons for termination", "D. As weaknesses to eliminate"],
    answer: "B",
    category: "S-O-A Coaching"
  },
  {
    id: 7,
    question: "In Step 3, the trainer's role is to:",
    options: ["A. Only observe without intervention", "B. Do the task while trainee watches", "C. Coach and intervene to prevent errors", "D. Leave the trainee alone"],
    answer: "C",
    category: "4-Step Model"
  },
  {
    id: 8,
    question: "When is Task Competency considered achieved?",
    options: ["A. After Step 1 is complete", "B. After Step 2 is complete", "C. After Step 3 is complete", "D. After successful Step 4 completion"],
    answer: "D",
    category: "4-Step Model"
  },
  {
    id: 9,
    question: "What is the key difference between Teaching and Coaching?",
    options: ["A. Teaching develops judgment, coaching gives answers", "B. Teaching gives answers, coaching develops judgment", "C. They are the same thing", "D. Teaching is for adults, coaching is for children"],
    answer: "B",
    category: "Coaching Fundamentals"
  },
  {
    id: 10,
    question: "Which phrase represents proper S-O-A feedback?",
    options: ["A. 'You're doing this wrong'", "B. 'Figure it out yourself'", "C. 'Your prep was spot-on. One opportunity is checking orientation earlier.'", "D. 'That's a mistake you should know better'"],
    answer: "C",
    category: "S-O-A Coaching"
  },
  {
    id: 11,
    question: "What is the goal of this training approach?",
    options: ["A. Compliance through pressure", "B. Competence with confidence", "C. Speed over accuracy", "D. Individual work without supervision"],
    answer: "B",
    category: "Philosophy"
  },
  {
    id: 12,
    question: "If a trainee repeats errors during training, what should the trainer do?",
    options: ["A. Raise their voice to emphasize importance", "B. Pause, return to earlier step, document, escalate without judgment", "C. End the training immediately", "D. Publicly correct them in front of peers"],
    answer: "B",
    category: "Escalation"
  },
];

const stepData = [
  {
    step: 1,
    title: "Trainer Does / Trainer Explains",
    objective: "Introduce the task and establish correct mental models.",
    color: "blue",
    trainerDuties: [
      "Perform the task at normal production pace",
      "Verbally explain what is being done and why it matters",
      "Explain how it impacts quality, safety, or downstream departments",
      "Explicitly identify Critical Points",
      "Identify who to contact if something is abnormal",
      "Explain where documentation, tools, or materials come from",
    ],
    traineeDuties: [
      "Observe without interruption",
      "Ask clarifying questions after the task completes",
      "Listen for critical points and failure modes",
    ],
    note: "No hands-on work by trainee in this step",
  },
  {
    step: 2,
    title: "Trainer Does / Trainee Explains",
    objective: "Verify comprehension before hands-on execution.",
    color: "teal",
    trainerDuties: [
      "Perform the task again",
      "Pause at critical steps",
      'Ask targeted questions: "What could go wrong here?"',
      '"What spec or WI applies?"',
      '"What would you do if X is out of tolerance?"',
    ],
    traineeDuties: [
      "Verbally explain each step while the trainer performs it",
      "Answer critical-point questions",
      "Identify risks, controls, and escalation paths",
    ],
    note: "If trainee cannot explain a critical point → return to Step 1",
  },
  {
    step: 3,
    title: "Trainee Does / Trainer Coaches",
    objective: "Build confidence while preventing bad habits.",
    color: "orange",
    trainerDuties: [
      "Stay hip-to-hip with trainee",
      "Allow trainee to perform the task",
      "Intervene only to prevent errors",
      "Reinforce critical points",
      "Correct technique immediately",
    ],
    traineeDuties: [
      "Perform the task fully",
      "Talk through the steps if needed",
      "Ask questions in real time",
      "Accept coaching and correction",
    ],
    note: "Trainer remains part of the process",
  },
  {
    step: 4,
    title: "Trainee Does / Trainer Observes",
    objective: "Validate independent competence.",
    color: "green",
    trainerDuties: [
      "Observe without intervention",
      "Confirm proper sequence",
      "Verify correct use of tools",
      "Check adherence to work instructions",
      "Validate recognition of critical points",
    ],
    traineeDuties: [
      "Perform the task independently",
      "Demonstrate confidence and consistency",
      "Show correct judgment at decision points",
    ],
    note: "Successful completion = Task Competency Achieved",
  },
];

const approvedPhrases = [
  "Good catch.",
  "That's exactly what we want.",
  "Pause here — what's the next critical point?",
  "You're on the right track — what happens if that spec is missed?",
  "Your material prep was spot-on.",
  "One opportunity is checking orientation earlier to avoid rework.",
  "You're doing this part exactly right — let's build on that.",
  "This is an opportunity to tighten the process.",
];

const prohibitedBehaviors = [
  "Yelling or raised voice",
  "Public embarrassment",
  "Sarcasm or ridicule",
  '"Figure it out" responses',
  "Withholding help to \"test\" someone",
];

export default function TrainerTraining() {
  return (
    <Container size="lg" py="xl">
      {/* Hero Section */}
      <Card withBorder shadow="md" mb="xl" p="xl" bg="teal.0">
        <Group gap="lg" align="flex-start">
          <ThemeIcon size={60} radius="md" variant="gradient" gradient={{ from: "teal", to: "cyan" }}>
            <IconSchool size={36} />
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Title order={1} mb="xs">Train-the-Trainer Program</Title>
            <Text size="lg" c="dimmed">
              Positive Coaching, Competency Assurance, and Cultural Consistency
            </Text>
            <Text mt="md">
              This program certifies trainers who can deliver technical training consistently, 
              coach in a positive manner, and develop trainees using strengths and opportunities—not fear.
            </Text>
          </div>
        </Group>
      </Card>

      {/* Quick Navigation */}
      <Card withBorder mb="xl">
        <Text fw={600} mb="sm">Quick Navigation</Text>
        <Group gap="xs">
          <Badge component="a" href="#philosophy" style={{ cursor: "pointer" }} variant="light">Philosophy</Badge>
          <Badge component="a" href="#4-step" style={{ cursor: "pointer" }} variant="light">4-Step Model</Badge>
          <Badge component="a" href="#soa" style={{ cursor: "pointer" }} variant="light">S-O-A Coaching</Badge>
          <Badge component="a" href="#fundamentals" style={{ cursor: "pointer" }} variant="light">Coaching Fundamentals</Badge>
          <Badge component="a" href="#certification" style={{ cursor: "pointer" }} variant="light">Certification</Badge>
          <Badge component="a" href="#prohibited" style={{ cursor: "pointer" }} variant="light">Prohibited Behaviors</Badge>
          <Badge component="a" href="#quiz" style={{ cursor: "pointer" }} variant="filled" color="indigo">Take Quiz</Badge>
        </Group>
      </Card>

      <Stack gap="xl">
        {/* Training Philosophy */}
        <section id="philosophy">
          <Card withBorder shadow="sm">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="blue" variant="light">
                <IconTarget size={20} />
              </ThemeIcon>
              <Title order={2}>Training Philosophy</Title>
            </Group>
            
            <Text mb="md">
              To ensure every employee is trained to perform tasks correctly, confidently, and independently, 
              while demonstrating integrity, accountability, and comprehension.
            </Text>

            <Grid>
              {[
                { icon: IconUsers, title: "Hip-to-Hip / Shadowing", desc: "Trainer stays alongside trainee throughout the process" },
                { icon: IconHandStop, title: "Hands-On, Not Observational", desc: "Active participation, not just watching" },
                { icon: IconAlertTriangle, title: "Critical-Point Driven", desc: "Focus on safety, quality, and compliance checkpoints" },
                { icon: IconShieldCheck, title: "Confidence Before Independence", desc: "Build competence before releasing trainee" },
                { icon: IconCheck, title: "Traceable & Repeatable", desc: "Documented and consistent across all departments" },
              ].map((item, idx) => (
                <Grid.Col key={idx} span={{ base: 12, sm: 6, md: 4 }}>
                  <Paper p="md" withBorder h="100%">
                    <Group gap="sm" mb="xs">
                      <ThemeIcon size="sm" variant="light" color="blue">
                        <item.icon size={14} />
                      </ThemeIcon>
                      <Text fw={600} size="sm">{item.title}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{item.desc}</Text>
                  </Paper>
                </Grid.Col>
              ))}
            </Grid>
          </Card>
        </section>

        {/* 4-Step Training Model */}
        <section id="4-step">
          <Card withBorder shadow="sm">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="teal" variant="light">
                <IconStars size={20} />
              </ThemeIcon>
              <Title order={2}>The 4-Step Training Model</Title>
            </Group>

            <Text mb="lg">
              This method applies uniformly, regardless of department, complexity, or role. 
              Each step builds on the previous to ensure comprehensive competency.
            </Text>

            <Accordion variant="separated">
              {stepData.map((step) => (
                <Accordion.Item key={step.step} value={`step-${step.step}`}>
                  <Accordion.Control>
                    <Group gap="sm">
                      <Badge size="xl" circle color={step.color}>{step.step}</Badge>
                      <div>
                        <Text fw={600}>{step.title}</Text>
                        <Text size="sm" c="dimmed">{step.objective}</Text>
                      </div>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Grid>
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper p="md" withBorder bg="blue.0">
                          <Text fw={600} mb="sm" c="blue.8">Trainer Responsibilities</Text>
                          <List size="sm" spacing="xs">
                            {step.trainerDuties.map((duty, idx) => (
                              <List.Item key={idx}>{duty}</List.Item>
                            ))}
                          </List>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper p="md" withBorder bg="teal.0">
                          <Text fw={600} mb="sm" c="teal.8">Trainee Responsibilities</Text>
                          <List size="sm" spacing="xs">
                            {step.traineeDuties.map((duty, idx) => (
                              <List.Item key={idx}>{duty}</List.Item>
                            ))}
                          </List>
                        </Paper>
                      </Grid.Col>
                    </Grid>
                    <Alert mt="md" variant="light" color={step.color} icon={<IconBulb size={16} />}>
                      {step.note}
                    </Alert>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </Card>
        </section>

        {/* S-O-A Coaching Model */}
        <section id="soa">
          <Card withBorder shadow="sm">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="orange" variant="light">
                <IconHeart size={20} />
              </ThemeIcon>
              <Title order={2}>S-O-A Coaching Model</Title>
            </Group>

            <Text mb="lg">
              The S-O-A framework ensures feedback is constructive, specific, and action-oriented. 
              Use this model for all coaching conversations.
            </Text>

            <Grid mb="lg">
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder h="100%" bg="green.0">
                  <Badge size="xl" color="green" mb="sm">S</Badge>
                  <Title order={4} c="green.8">Strength</Title>
                  <Text size="sm" mt="sm">"What did the trainee do well?"</Text>
                  <Text size="sm" c="dimmed" mt="xs">
                    Identify and reinforce correct behaviors. Build confidence first.
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder h="100%" bg="orange.0">
                  <Badge size="xl" color="orange" mb="sm">O</Badge>
                  <Title order={4} c="orange.8">Opportunity</Title>
                  <Text size="sm" mt="sm">"What could be improved or refined?"</Text>
                  <Text size="sm" c="dimmed" mt="xs">
                    Frame mistakes as learning opportunities, not failures.
                  </Text>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder h="100%" bg="blue.0">
                  <Badge size="xl" color="blue" mb="sm">A</Badge>
                  <Title order={4} c="blue.8">Action</Title>
                  <Text size="sm" mt="sm">"What will we do differently next time?"</Text>
                  <Text size="sm" c="dimmed" mt="xs">
                    Define specific, actionable next steps.
                  </Text>
                </Card>
              </Grid.Col>
            </Grid>

            <Paper p="md" withBorder bg="gray.0">
              <Text fw={600} mb="sm">Example S-O-A Feedback:</Text>
              <Text size="sm" fs="italic">
                "Your material prep was spot-on. One opportunity is checking orientation earlier to avoid rework. 
                Next time, let's pause and verify before cutting."
              </Text>
            </Paper>
          </Card>
        </section>

        {/* Coaching Fundamentals */}
        <section id="fundamentals">
          <Card withBorder shadow="sm">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="violet" variant="light">
                <IconMessageCircle size={20} />
              </ThemeIcon>
              <Title order={2}>Coaching Fundamentals</Title>
            </Group>

            <Grid mb="lg">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder h="100%">
                  <Text fw={600} mb="sm">Teaching vs Coaching</Text>
                  <Table withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Teaching</Table.Th>
                        <Table.Th>Coaching</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td>Explains how</Table.Td>
                        <Table.Td>Develops judgment</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>Gives answers</Table.Td>
                        <Table.Td>Asks questions</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>Focuses on steps</Table.Td>
                        <Table.Td>Focuses on understanding</Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Paper>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper p="md" withBorder h="100%">
                  <Text fw={600} mb="sm">Psychological Safety</Text>
                  <Text size="sm" mb="sm">Trainees must feel safe to:</Text>
                  <List size="sm" spacing="xs" icon={<ThemeIcon size="xs" color="green" variant="light"><IconCheck size={10} /></ThemeIcon>}>
                    <List.Item>Ask questions freely</List.Item>
                    <List.Item>Admit uncertainty</List.Item>
                    <List.Item>Stop the process when unsure</List.Item>
                  </List>
                  <Text size="sm" mt="sm" mb="sm">But also understand:</Text>
                  <List size="sm" spacing="xs" icon={<ThemeIcon size="xs" color="blue" variant="light"><IconShieldCheck size={10} /></ThemeIcon>}>
                    <List.Item>Standards do not change</List.Item>
                    <List.Item>Critical points are not optional</List.Item>
                  </List>
                </Paper>
              </Grid.Col>
            </Grid>

            <Paper p="md" withBorder bg="green.0">
              <Text fw={600} mb="sm" c="green.8">Approved Coaching Phrases</Text>
              <Grid>
                {approvedPhrases.map((phrase, idx) => (
                  <Grid.Col key={idx} span={{ base: 12, sm: 6 }}>
                    <Group gap="xs">
                      <ThemeIcon size="xs" color="green" variant="filled">
                        <IconCheck size={10} />
                      </ThemeIcon>
                      <Text size="sm">"{phrase}"</Text>
                    </Group>
                  </Grid.Col>
                ))}
              </Grid>
            </Paper>
          </Card>
        </section>

        {/* Trainer Certification */}
        <section id="certification">
          <Card withBorder shadow="sm">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="cyan" variant="light">
                <IconCertificate size={20} />
              </ThemeIcon>
              <Title order={2}>Trainer Certification</Title>
            </Group>

            <Text mb="lg">
              To be certified, trainers must complete all phases and demonstrate both technical mastery and positive coaching skills.
            </Text>

            <Accordion variant="separated">
              <Accordion.Item value="phase1">
                <Accordion.Control>
                  <Group gap="sm">
                    <Badge>Phase 1</Badge>
                    <Text fw={600}>Technical Mastery</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text mb="sm">Trainer must demonstrate:</Text>
                  <List>
                    <List.Item>Full understanding of all 4 steps</List.Item>
                    <List.Item>Ability to explain why each step exists</List.Item>
                    <List.Item>Commitment to not skipping steps for speed</List.Item>
                  </List>
                  <Alert mt="md" color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                    No trainer is allowed to "shortcut" the process.
                  </Alert>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="phase2">
                <Accordion.Control>
                  <Group gap="sm">
                    <Badge>Phase 2</Badge>
                    <Text fw={600}>Coaching Fundamentals</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <List>
                    <List.Item>Understand the difference between teaching and coaching</List.Item>
                    <List.Item>Master the S-O-A feedback model</List.Item>
                    <List.Item>Use approved coaching language consistently</List.Item>
                    <List.Item>Create psychological safety while maintaining standards</List.Item>
                  </List>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="phase3">
                <Accordion.Control>
                  <Group gap="sm">
                    <Badge>Phase 3</Badge>
                    <Text fw={600}>Practical Application</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text mb="sm">Apply positive coaching in each training step:</Text>
                  <List>
                    <List.Item><b>Step 1:</b> Model calm, professional behavior; explain why, not just what</List.Item>
                    <List.Item><b>Step 2:</b> Encourage thinking over memorization; praise correct explanations</List.Item>
                    <List.Item><b>Step 3:</b> Correct immediately but calmly; reinforce progress continuously</List.Item>
                    <List.Item><b>Step 4:</b> No micromanaging; debrief using S-O-A afterward</List.Item>
                  </List>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="phase4">
                <Accordion.Control>
                  <Group gap="sm">
                    <Badge>Phase 4</Badge>
                    <Text fw={600}>Evaluation & Certification</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text mb="sm">To be certified, the trainer must:</Text>
                  <List icon={<ThemeIcon size="xs" color="green" variant="filled"><IconCheck size={10} /></ThemeIcon>}>
                    <List.Item>Conduct a full 4-step training on a real task</List.Item>
                    <List.Item>Demonstrate positive coaching language</List.Item>
                    <List.Item>Maintain calm under trainee mistakes</List.Item>
                    <List.Item>Complete a post-training debrief using S-O-A</List.Item>
                  </List>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Card>
        </section>

        {/* Prohibited Behaviors */}
        <section id="prohibited">
          <Card withBorder shadow="sm" bg="red.0">
            <Group gap="sm" mb="md">
              <ThemeIcon size="lg" color="red" variant="light">
                <IconX size={20} />
              </ThemeIcon>
              <Title order={2} c="red.8">Prohibited Behaviors During Training</Title>
            </Group>

            <Text mb="lg">
              The following behaviors are <b>explicitly prohibited</b> during training. 
              Discipline belongs outside the training process and follows formal HR policy—not trainer discretion.
            </Text>

            <Grid>
              {prohibitedBehaviors.map((behavior, idx) => (
                <Grid.Col key={idx} span={{ base: 12, sm: 6 }}>
                  <Paper p="md" withBorder bg="white">
                    <Group gap="sm">
                      <ThemeIcon size="md" color="red" variant="filled">
                        <IconX size={14} />
                      </ThemeIcon>
                      <Text fw={500}>{behavior}</Text>
                    </Group>
                  </Paper>
                </Grid.Col>
              ))}
            </Grid>

            <Alert mt="lg" color="blue" variant="light" icon={<IconBulb size={16} />}>
              <Text fw={600}>Trainer Escalation Guidance</Text>
              <Text size="sm" mt="xs">
                If a trainee repeats errors, appears disengaged, or struggles with comprehension: 
                Pause the process → Return to an earlier step → Document observations → Escalate to supervisor without judgment.
              </Text>
            </Alert>
          </Card>
        </section>

        {/* Trainer Quiz Section */}
        <TrainerQuiz />

        {/* Cultural Impact */}
        <Card withBorder shadow="sm" bg="gradient" style={{ background: "linear-gradient(135deg, #e6fcf5 0%, #e7f5ff 100%)" }}>
          <Group gap="sm" mb="md">
            <ThemeIcon size="lg" color="teal" variant="filled">
              <IconHeart size={20} />
            </ThemeIcon>
            <Title order={2}>Cultural Impact</Title>
          </Group>
          
          <Text mb="md">This system builds a culture of excellence:</Text>
          
          <Grid>
            {[
              "Builds trust quickly",
              "Reduces rework and scrap",
              "Increases retention",
              "Encourages speaking up",
              "Produces trainers who lead, not intimidate",
            ].map((impact, idx) => (
              <Grid.Col key={idx} span={{ base: 12, sm: 6, md: 4 }}>
                <Group gap="xs">
                  <ThemeIcon size="sm" color="teal" variant="light">
                    <IconCheck size={12} />
                  </ThemeIcon>
                  <Text size="sm" fw={500}>{impact}</Text>
                </Group>
              </Grid.Col>
            ))}
          </Grid>

          <Divider my="lg" />

          <Text size="sm" c="dimmed" ta="center">
            <b>Remember:</b> Discipline corrects behavior. Coaching develops people. 
            The goal is competence with confidence, not compliance through pressure.
          </Text>
        </Card>
      </Stack>
    </Container>
  );
}

function TrainerQuiz() {
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [shuffledQuestions, setShuffledQuestions] = useState<typeof trainerQuizQuestions>([]);

  const startQuiz = () => {
    const shuffled = [...trainerQuizQuestions].sort(() => Math.random() - 0.5).slice(0, 10);
    setShuffledQuestions(shuffled);
    setQuizStarted(true);
    setCurrentQuestion(0);
    setAnswers({});
    setSubmitted(false);
  };

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const submitQuiz = () => {
    setSubmitted(true);
  };

  const resetQuiz = () => {
    setQuizStarted(false);
    setSubmitted(false);
    setAnswers({});
    setCurrentQuestion(0);
  };

  const score = shuffledQuestions.reduce((acc, q) => {
    const userAnswer = answers[q.id];
    if (userAnswer && userAnswer.startsWith(q.answer)) return acc + 1;
    return acc;
  }, 0);

  const passed = score >= Math.ceil(shuffledQuestions.length * 0.8);

  if (!quizStarted) {
    return (
      <section id="quiz">
        <Card withBorder shadow="sm">
          <Group gap="sm" mb="md">
            <ThemeIcon size="lg" color="indigo" variant="light">
              <IconClipboardCheck size={20} />
            </ThemeIcon>
            <Title order={2}>Trainer Knowledge Quiz</Title>
          </Group>

          <Text mb="md">
            Test your understanding of the training methodology, S-O-A coaching, and trainer responsibilities. 
            You need 80% to pass.
          </Text>

          <Grid mb="lg">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder ta="center">
                <Text size="xl" fw={700} c="indigo">10</Text>
                <Text size="sm" c="dimmed">Questions</Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder ta="center">
                <Text size="xl" fw={700} c="orange">80%</Text>
                <Text size="sm" c="dimmed">Pass Threshold</Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Paper p="md" withBorder ta="center">
                <Text size="xl" fw={700} c="teal">Randomized</Text>
                <Text size="sm" c="dimmed">Each Attempt</Text>
              </Paper>
            </Grid.Col>
          </Grid>

          <Button 
            size="lg" 
            fullWidth 
            onClick={startQuiz}
            leftSection={<IconSchool size={20} />}
          >
            Start Quiz
          </Button>
        </Card>
      </section>
    );
  }

  if (submitted) {
    return (
      <section id="quiz">
        <Card withBorder shadow="sm">
          <Group gap="sm" mb="md">
            <ThemeIcon size="lg" color={passed ? "green" : "red"} variant="light">
              {passed ? <IconCheck size={20} /> : <IconX size={20} />}
            </ThemeIcon>
            <Title order={2}>Quiz Results</Title>
          </Group>

          <Paper p="xl" withBorder mb="lg" ta="center" bg={passed ? "green.0" : "red.0"}>
            <Text size="3rem" fw={700} c={passed ? "green.7" : "red.7"}>
              {score} / {shuffledQuestions.length}
            </Text>
            <Text size="lg" fw={600} c={passed ? "green.7" : "red.7"}>
              {passed ? "PASSED" : "NOT PASSED"}
            </Text>
            <Text size="sm" c="dimmed" mt="xs">
              {Math.round((score / shuffledQuestions.length) * 100)}% correct
            </Text>
          </Paper>

          <Stack gap="md" mb="lg">
            {shuffledQuestions.map((q, idx) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer && userAnswer.startsWith(q.answer);
              return (
                <Paper key={q.id} p="md" withBorder bg={isCorrect ? "green.0" : "red.0"}>
                  <Group gap="xs" mb="xs">
                    <Badge size="sm" color={isCorrect ? "green" : "red"}>
                      {isCorrect ? "Correct" : "Incorrect"}
                    </Badge>
                    <Badge size="sm" variant="light">{q.category}</Badge>
                  </Group>
                  <Text size="sm" fw={500} mb="xs">{idx + 1}. {q.question}</Text>
                  <Text size="sm" c={isCorrect ? "green.7" : "red.7"}>
                    Your answer: {userAnswer || "Not answered"}
                  </Text>
                  {!isCorrect && (
                    <Text size="sm" c="green.7" fw={500}>
                      Correct answer: {q.options.find(o => o.startsWith(q.answer))}
                    </Text>
                  )}
                </Paper>
              );
            })}
          </Stack>

          <Button 
            fullWidth 
            onClick={resetQuiz}
            leftSection={<IconRefresh size={18} />}
            variant={passed ? "light" : "filled"}
          >
            {passed ? "Take Quiz Again" : "Retry Quiz"}
          </Button>
        </Card>
      </section>
    );
  }

  const question = shuffledQuestions[currentQuestion];
  const progress = ((currentQuestion + 1) / shuffledQuestions.length) * 100;

  return (
    <section id="quiz">
      <Card withBorder shadow="sm">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <ThemeIcon size="lg" color="indigo" variant="light">
              <IconClipboardCheck size={20} />
            </ThemeIcon>
            <Title order={2}>Trainer Knowledge Quiz</Title>
          </Group>
          <Badge size="lg" variant="light">
            Question {currentQuestion + 1} of {shuffledQuestions.length}
          </Badge>
        </Group>

        <Progress value={progress} size="sm" mb="lg" color="indigo" />

        <Paper p="lg" withBorder mb="lg">
          <Badge mb="sm" variant="light">{question.category}</Badge>
          <Text size="lg" fw={500} mb="lg">{question.question}</Text>

          <Radio.Group
            value={answers[question.id] || ""}
            onChange={(value) => handleAnswer(question.id, value)}
          >
            <Stack gap="sm">
              {question.options.map((option) => (
                <Paper 
                  key={option} 
                  p="sm" 
                  withBorder 
                  style={{ 
                    cursor: "pointer",
                    borderColor: answers[question.id] === option ? "var(--mantine-color-indigo-5)" : undefined,
                    backgroundColor: answers[question.id] === option ? "var(--mantine-color-indigo-0)" : undefined,
                  }}
                  onClick={() => handleAnswer(question.id, option)}
                >
                  <Radio value={option} label={option} />
                </Paper>
              ))}
            </Stack>
          </Radio.Group>
        </Paper>

        <Group justify="space-between">
          <Button 
            variant="light" 
            disabled={currentQuestion === 0}
            onClick={() => setCurrentQuestion(prev => prev - 1)}
          >
            Previous
          </Button>
          
          {currentQuestion < shuffledQuestions.length - 1 ? (
            <Button 
              onClick={() => setCurrentQuestion(prev => prev + 1)}
              disabled={!answers[question.id]}
            >
              Next
            </Button>
          ) : (
            <Button 
              color="green"
              onClick={submitQuiz}
              disabled={Object.keys(answers).length < shuffledQuestions.length}
            >
              Submit Quiz
            </Button>
          )}
        </Group>
      </Card>
    </section>
  );
}
