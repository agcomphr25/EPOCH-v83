import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Container,
  Title,
  Card,
  Select,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Checkbox,
  Textarea,
  Progress,
  Divider,
  Paper,
  ThemeIcon,
  Box,
  Grid,
  Accordion,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPrinter,
  IconClipboardCheck,
  IconAlertTriangle,
  IconCheck,
  IconFileText,
} from "@tabler/icons-react";

type Trainee = { id: string; name: string; roleId?: string | null };
type FacilityTopic = { id: string; code: string; title: string };
type SessionResp = { session: any; trainee: any; blocks: any[] };
type StartError = { error: string } | null;

export default function TrainerToday() {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [facilityTopics, setFacilityTopics] = useState<FacilityTopic[]>([]);
  const [traineeId, setTraineeId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState("Trainer");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [facilityTopicCode, setFacilityTopicCode] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionResp | null>(null);
  const [startError, setStartError] = useState<StartError>(null);

  async function loadData() {
    const [traineeData, topicData] = await Promise.all([
      fetch("/api/trainees").then(r => r.json()),
      fetch("/api/library/facility-topics").then(r => r.json())
    ]);
    setTrainees(traineeData);
    setFacilityTopics(topicData);
    if (topicData.length > 0 && !facilityTopicCode) {
      setFacilityTopicCode(topicData[0].code);
    }
  }

  async function startSession() {
    if (!traineeId || !facilityTopicCode) return;
    setStartError(null);
    const r = await fetch("/api/training/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traineeId, trainerName, date, facilityTopicCode })
    });
    const data = await r.json();
    if (!r.ok) {
      setStartError(data);
      return;
    }
    setSessionId(data.sessionId);
  }

  async function loadSession(id: string) {
    const r = await fetch(`/api/training/sessions/${id}`);
    setSessionData(await r.json());
  }

  async function patchBlock(blockId: string, patch: any) {
    await fetch(`/api/training/task-blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (sessionId) await loadSession(sessionId);
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (sessionId) loadSession(sessionId); }, [sessionId]);

  const calculateProgress = () => {
    if (!sessionData?.blocks.length) return 0;
    const total = sessionData.blocks.length * 4;
    const completed = sessionData.blocks.reduce((acc, b) => {
      return acc + (b.step1 ? 1 : 0) + (b.step2 ? 1 : 0) + (b.step3 ? 1 : 0) + (b.step4 ? 1 : 0);
    }, 0);
    return Math.round((completed / total) * 100);
  };

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Trainer Dashboard</Title>

      {!sessionId ? (
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card>
              <Title order={4} mb="md">Start New Session</Title>
              <Stack gap="md">
                <Select
                  label="Trainee"
                  placeholder="Select trainee..."
                  data={trainees.map(t => ({ value: t.id, label: t.name }))}
                  value={traineeId}
                  onChange={setTraineeId}
                />
                <TextInput
                  label="Trainer Name"
                  value={trainerName}
                  onChange={e => setTrainerName(e.target.value)}
                />
                <TextInput
                  label="Date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                <Select
                  label="Facility Topic"
                  placeholder="Select topic..."
                  data={facilityTopics.map(t => ({ value: t.code, label: `${t.code} - ${t.title}` }))}
                  value={facilityTopicCode}
                  onChange={setFacilityTopicCode}
                />
                {traineeId && !trainees.find(t => t.id === traineeId)?.roleId && (
                  <Paper p="sm" withBorder bg="orange.0">
                    <Group gap="xs">
                      <IconAlertTriangle size={16} color="orange" />
                      <Text size="sm" c="orange.8">
                        This trainee has no role assigned. Please assign a role in the Content Library first.
                      </Text>
                    </Group>
                  </Paper>
                )}
                {startError && (
                  <Paper p="sm" withBorder bg="red.0">
                    <Group gap="xs">
                      <IconAlertTriangle size={16} color="red" />
                      <Text size="sm" c="red.8">{startError.error}</Text>
                    </Group>
                  </Paper>
                )}
                <Button
                  size="lg"
                  leftSection={<IconPlayerPlay size={20} />}
                  disabled={!traineeId || !facilityTopicCode || !trainees.find(t => t.id === traineeId)?.roleId}
                  onClick={startSession}
                >
                  Start Session
                </Button>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card>
              <Title order={4} mb="md">4-Step Training Method</Title>
              <Stack gap="sm">
                <Paper p="sm" withBorder>
                  <Group gap="sm">
                    <Badge size="lg" circle>1</Badge>
                    <Text size="sm"><b>Trainer Does / Explains</b> - Demonstrate the task while explaining key points</Text>
                  </Group>
                </Paper>
                <Paper p="sm" withBorder>
                  <Group gap="sm">
                    <Badge size="lg" circle>2</Badge>
                    <Text size="sm"><b>Trainer Does / Trainee Explains</b> - Repeat while trainee explains back</Text>
                  </Group>
                </Paper>
                <Paper p="sm" withBorder>
                  <Group gap="sm">
                    <Badge size="lg" circle>3</Badge>
                    <Text size="sm"><b>Trainee Does / Trainer Coaches</b> - Trainee performs with guidance</Text>
                  </Group>
                </Paper>
                <Paper p="sm" withBorder>
                  <Group gap="sm">
                    <Badge size="lg" circle>4</Badge>
                    <Text size="sm"><b>Trainee Does / Trainer Observes</b> - Independent performance</Text>
                  </Group>
                </Paper>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      ) : (
        <Stack gap="lg">
          <Card>
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" c="dimmed">Session for</Text>
                <Title order={4}>{sessionData?.trainee?.name}</Title>
              </div>
              <Group>
                <Button
                  variant="light"
                  leftSection={<IconPrinter size={16} />}
                  component={Link}
                  href={`/print/${sessionId}`}
                >
                  Print Sheet
                </Button>
                <Button
                  variant="light"
                  color="orange"
                  leftSection={<IconClipboardCheck size={16} />}
                  component={Link}
                  href={`/quiz/${sessionId}`}
                >
                  Take Quiz
                </Button>
              </Group>
            </Group>
            <Divider my="md" />
            <Group align="center" gap="md">
              <Text size="sm" fw={500}>Overall Progress</Text>
              <Progress value={calculateProgress()} size="lg" radius="xl" style={{ flex: 1 }} />
              <Text size="sm" fw={600}>{calculateProgress()}%</Text>
            </Group>
          </Card>

          <Title order={4}>Tasks</Title>

          {sessionData?.blocks.map((block) => (
            <Card key={block.id}>
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={600} size="lg">{block.taskName}</Text>
                  <Text size="sm" c="dimmed">
                    {block.wiCode ? `${block.wiCode} - ${block.wiTitle}` : "No work instruction linked"}
                  </Text>
                </div>
                <Badge
                  size="lg"
                  color={block.step1 && block.step2 && block.step3 && block.step4 ? "green" : "gray"}
                  leftSection={block.step1 && block.step2 && block.step3 && block.step4 ? <IconCheck size={14} /> : null}
                >
                  {block.step1 && block.step2 && block.step3 && block.step4 ? "Complete" : "In Progress"}
                </Badge>
              </Group>

              <Group gap="xl" mb="md">
                {(["step1", "step2", "step3", "step4"] as const).map((s, idx) => (
                  <Checkbox
                    key={s}
                    label={`Step ${idx + 1}`}
                    checked={!!block[s]}
                    onChange={(e) => patchBlock(block.id, { [s]: e.target.checked })}
                    size="md"
                  />
                ))}
              </Group>

              <Accordion variant="separated">
                {block.wiCode && (
                  <Accordion.Item value="work-instruction">
                    <Accordion.Control>
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color="blue">
                          <IconFileText size={14} />
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Work Instruction</Text>
                        <Badge variant="outline" size="sm">{block.wiCode}</Badge>
                        <Badge variant="light" color="gray" size="xs">Rev. {block.wiRevision || "—"}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="md">
                        <Paper p="sm" withBorder radius="md" bg="blue.0">
                          <Text size="lg" fw={600} c="blue.8">{block.wiTitle}</Text>
                        </Paper>
                        {block.wiBody ? (
                          <Box>
                            {block.wiBody.split('\n\n').map((paragraph: string, idx: number) => (
                              <Text 
                                key={idx} 
                                size="sm" 
                                mb="sm"
                                style={{ lineHeight: 1.6 }}
                              >
                                {paragraph.split('\n').map((line: string, lineIdx: number) => (
                                  <React.Fragment key={lineIdx}>
                                    {line}
                                    {lineIdx < paragraph.split('\n').length - 1 && <br />}
                                  </React.Fragment>
                                ))}
                              </Text>
                            ))}
                          </Box>
                        ) : (
                          <Text size="sm" c="dimmed" fs="italic">No work instruction content available.</Text>
                        )}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )}

                <Accordion.Item value="soa">
                  <Accordion.Control>
                    <Group gap="xs">
                      <ThemeIcon size="sm" variant="light" color="teal">
                        <IconClipboardCheck size={14} />
                      </ThemeIcon>
                      <Text size="sm" fw={500}>S-O-A Coaching Notes</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Textarea
                        label="Strength"
                        placeholder="What did they do well?"
                        value={block.strength ?? ""}
                        onChange={(e) => patchBlock(block.id, { strength: e.target.value })}
                        minRows={2}
                      />
                      <Textarea
                        label="Opportunity"
                        placeholder="What could be improved?"
                        value={block.opportunity ?? ""}
                        onChange={(e) => patchBlock(block.id, { opportunity: e.target.value })}
                        minRows={2}
                      />
                      <Textarea
                        label="Action"
                        placeholder="What action will be taken?"
                        value={block.action ?? ""}
                        onChange={(e) => patchBlock(block.id, { action: e.target.value })}
                        minRows={2}
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                {block.criticalPoints?.length > 0 && (
                  <Accordion.Item value="critical">
                    <Accordion.Control>
                      <Group gap="xs">
                        <ThemeIcon size="sm" variant="light" color="orange">
                          <IconAlertTriangle size={14} />
                        </ThemeIcon>
                        <Text size="sm" fw={500}>Critical Points ({block.criticalPoints.length})</Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        {block.criticalPoints.map((cp: any) => (
                          <Paper key={cp.id} p="sm" withBorder>
                            <Group gap="sm">
                              <Badge
                                color={cp.severity === "critical" ? "red" : cp.severity === "major" ? "orange" : "green"}
                                size="sm"
                              >
                                {cp.severity}
                              </Badge>
                              <Text size="sm"><b>{cp.label}</b> — {cp.detail}</Text>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )}
              </Accordion>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
