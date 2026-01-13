import React, { useEffect, useState } from "react";
import {
  Box,
  Title,
  Text,
  Card,
  Group,
  Stack,
  Badge,
  Progress,
  ThemeIcon,
  Grid,
  Paper,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconUsers,
  IconClipboardCheck,
  IconCalendarEvent,
  IconClock,
  IconCheck,
  IconAlertTriangle,
  IconSun,
  IconMoon,
  IconMaximize,
  IconRefresh,
} from "@tabler/icons-react";

interface Session {
  id: string;
  date: string;
  traineeId: string;
  trainerId: string;
  traineeSignature: string | null;
  trainerSignature: string | null;
  competencyAttested: boolean;
  trainee?: { name: string };
  blocks?: Array<{
    id: string;
    step1: boolean;
    step2: boolean;
    step3: boolean;
    step4: boolean;
    task?: { title: string };
  }>;
}

interface Plan {
  id: string;
  name: string;
  createdAt: string;
  trainee?: { name: string };
  tasks?: Array<{ title: string }>;
}

interface Trainee {
  id: string;
  name: string;
  roleId: string | null;
}

export default function TVDisplay() {
  const [darkMode, setDarkMode] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [sessionsRes, plansRes, traineesRes] = await Promise.all([
        fetch("/api/training/sessions"),
        fetch("/api/plans"),
        fetch("/api/trainees"),
      ]);
      
      const sessionsData = await sessionsRes.json();
      const plansData = await plansRes.json();
      const traineesData = await traineesRes.json();
      
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setTrainees(Array.isArray(traineesData) ? traineesData : []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch TV display data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const todaySessions = sessions.filter(s => {
    const sessionDate = new Date(s.date).toDateString();
    const today = new Date().toDateString();
    return sessionDate === today;
  });

  const completedToday = todaySessions.filter(s => s.competencyAttested).length;
  const inProgressToday = todaySessions.filter(s => !s.competencyAttested).length;

  const traineesWithoutRoles = trainees.filter(t => !t.roleId);

  const totalSteps = todaySessions.reduce((acc, s) => acc + (s.blocks?.length || 0) * 4, 0);
  const completedSteps = todaySessions.reduce((acc, s) => {
    return acc + (s.blocks?.reduce((blockAcc, b) => {
      return blockAcc + (b.step1 ? 1 : 0) + (b.step2 ? 1 : 0) + (b.step3 ? 1 : 0) + (b.step4 ? 1 : 0);
    }, 0) || 0);
  }, 0);

  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const bgColor = darkMode ? "#1a1b1e" : "#f8f9fa";
  const cardBg = darkMode ? "#25262b" : "#ffffff";
  const textColor = darkMode ? "#ffffff" : "#1a1b1e";
  const mutedColor = darkMode ? "#909296" : "#868e96";

  return (
    <Box
      p="xl"
      style={{
        minHeight: "100vh",
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Group gap="lg">
          <ThemeIcon size={60} radius="md" variant="gradient" gradient={{ from: "teal", to: "cyan" }}>
            <IconClipboardCheck size={36} />
          </ThemeIcon>
          <div>
            <Title order={1} style={{ fontSize: "3rem", color: textColor }}>
              Training Dashboard
            </Title>
            <Text size="xl" c={mutedColor}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </Text>
          </div>
        </Group>

        <Group gap="md">
          <Text size="lg" c={mutedColor}>
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Text>
          <Tooltip label="Refresh">
            <ActionIcon size="xl" variant="light" onClick={fetchData}>
              <IconRefresh size={24} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={darkMode ? "Light Mode" : "Dark Mode"}>
            <ActionIcon size="xl" variant="light" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <IconSun size={24} /> : <IconMoon size={24} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Fullscreen">
            <ActionIcon size="xl" variant="light" onClick={toggleFullscreen}>
              <IconMaximize size={24} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Stats Row */}
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card p="xl" radius="lg" style={{ backgroundColor: cardBg }}>
            <Group justify="space-between">
              <div>
                <Text size="lg" c={mutedColor} tt="uppercase" fw={600}>Today's Sessions</Text>
                <Text style={{ fontSize: "4rem", fontWeight: 700, color: textColor, lineHeight: 1 }}>
                  {todaySessions.length}
                </Text>
              </div>
              <ThemeIcon size={80} radius="md" color="blue" variant="light">
                <IconCalendarEvent size={48} />
              </ThemeIcon>
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card p="xl" radius="lg" style={{ backgroundColor: cardBg }}>
            <Group justify="space-between">
              <div>
                <Text size="lg" c={mutedColor} tt="uppercase" fw={600}>Completed</Text>
                <Text style={{ fontSize: "4rem", fontWeight: 700, color: "#40c057", lineHeight: 1 }}>
                  {completedToday}
                </Text>
              </div>
              <ThemeIcon size={80} radius="md" color="green" variant="light">
                <IconCheck size={48} />
              </ThemeIcon>
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card p="xl" radius="lg" style={{ backgroundColor: cardBg }}>
            <Group justify="space-between">
              <div>
                <Text size="lg" c={mutedColor} tt="uppercase" fw={600}>In Progress</Text>
                <Text style={{ fontSize: "4rem", fontWeight: 700, color: "#fab005", lineHeight: 1 }}>
                  {inProgressToday}
                </Text>
              </div>
              <ThemeIcon size={80} radius="md" color="yellow" variant="light">
                <IconClock size={48} />
              </ThemeIcon>
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card p="xl" radius="lg" style={{ backgroundColor: cardBg }}>
            <Group justify="space-between">
              <div>
                <Text size="lg" c={mutedColor} tt="uppercase" fw={600}>Active Trainees</Text>
                <Text style={{ fontSize: "4rem", fontWeight: 700, color: textColor, lineHeight: 1 }}>
                  {trainees.length}
                </Text>
              </div>
              <ThemeIcon size={80} radius="md" color="violet" variant="light">
                <IconUsers size={48} />
              </ThemeIcon>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Progress Bar */}
      <Card p="xl" radius="lg" mb="xl" style={{ backgroundColor: cardBg }}>
        <Group justify="space-between" mb="md">
          <Text size="xl" fw={600} c={textColor}>Daily Training Progress</Text>
          <Text size="xl" fw={700} c="teal">{progressPercent}%</Text>
        </Group>
        <Progress value={progressPercent} size={40} radius="md" color="teal" />
        <Group justify="space-between" mt="md">
          <Text size="lg" c={mutedColor}>{completedSteps} steps completed</Text>
          <Text size="lg" c={mutedColor}>{totalSteps} total steps</Text>
        </Group>
      </Card>

      {/* Main Content */}
      <Grid>
        {/* Active Sessions */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card p="xl" radius="lg" style={{ backgroundColor: cardBg, height: "100%" }}>
            <Group gap="sm" mb="lg">
              <ThemeIcon size="lg" color="teal" variant="light">
                <IconClipboardCheck size={24} />
              </ThemeIcon>
              <Title order={2} style={{ color: textColor }}>Active Training Sessions</Title>
            </Group>

            {todaySessions.length === 0 ? (
              <Text size="xl" c={mutedColor} ta="center" py="xl">
                No training sessions scheduled for today
              </Text>
            ) : (
              <Stack gap="md">
                {todaySessions.slice(0, 5).map((session) => {
                  const blocks = session.blocks || [];
                  const sessionSteps = blocks.length * 4;
                  const sessionCompleted = blocks.reduce((acc, b) => {
                    return acc + (b.step1 ? 1 : 0) + (b.step2 ? 1 : 0) + (b.step3 ? 1 : 0) + (b.step4 ? 1 : 0);
                  }, 0);
                  const sessionProgress = sessionSteps > 0 ? Math.round((sessionCompleted / sessionSteps) * 100) : 0;

                  return (
                    <Paper key={session.id} p="lg" withBorder radius="md" style={{ borderColor: darkMode ? "#373a40" : "#dee2e6" }}>
                      <Group justify="space-between" mb="sm">
                        <div>
                          <Text size="xl" fw={600} c={textColor}>
                            {session.trainee?.name || "Unknown Trainee"}
                          </Text>
                          <Text size="lg" c={mutedColor}>
                            {blocks.length} task{blocks.length !== 1 ? "s" : ""}
                          </Text>
                        </div>
                        <Badge 
                          size="xl" 
                          color={session.competencyAttested ? "green" : sessionProgress > 0 ? "yellow" : "gray"}
                          variant="filled"
                        >
                          {session.competencyAttested ? "COMPLETE" : sessionProgress > 0 ? "IN PROGRESS" : "NOT STARTED"}
                        </Badge>
                      </Group>
                      <Progress value={sessionProgress} size="lg" radius="md" color={session.competencyAttested ? "green" : "teal"} />
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Card>
        </Grid.Col>

        {/* Alerts & Info */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg" h="100%">
            {/* Alerts */}
            {traineesWithoutRoles.length > 0 && (
              <Card p="xl" radius="lg" style={{ backgroundColor: "#fff3bf" }}>
                <Group gap="sm" mb="md">
                  <ThemeIcon size="lg" color="yellow" variant="filled">
                    <IconAlertTriangle size={24} />
                  </ThemeIcon>
                  <Title order={3} c="dark">Attention Needed</Title>
                </Group>
                <Text size="lg" c="dark">
                  {traineesWithoutRoles.length} trainee{traineesWithoutRoles.length !== 1 ? "s" : ""} without assigned roles
                </Text>
                <Stack gap="xs" mt="md">
                  {traineesWithoutRoles.slice(0, 3).map(t => (
                    <Badge key={t.id} size="lg" color="yellow" variant="filled">{t.name}</Badge>
                  ))}
                  {traineesWithoutRoles.length > 3 && (
                    <Text size="md" c="dark">+{traineesWithoutRoles.length - 3} more</Text>
                  )}
                </Stack>
              </Card>
            )}

            {/* Recent Plans */}
            <Card p="xl" radius="lg" style={{ backgroundColor: cardBg, flex: 1 }}>
              <Group gap="sm" mb="md">
                <ThemeIcon size="lg" color="indigo" variant="light">
                  <IconCalendarEvent size={24} />
                </ThemeIcon>
                <Title order={3} style={{ color: textColor }}>Training Plans</Title>
              </Group>

              {plans.length === 0 ? (
                <Text size="lg" c={mutedColor}>No training plans created</Text>
              ) : (
                <Stack gap="sm">
                  {plans.slice(0, 4).map((plan) => (
                    <Paper key={plan.id} p="md" withBorder radius="md" style={{ borderColor: darkMode ? "#373a40" : "#dee2e6" }}>
                      <Text size="lg" fw={600} c={textColor}>{plan.name}</Text>
                      <Text size="md" c={mutedColor}>
                        {plan.trainee?.name || "Unassigned"}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Footer */}
      <Box mt="xl" ta="center">
        <Text size="lg" c={mutedColor}>
          Train-the-Trainer System | Auto-refreshes every 30 seconds
        </Text>
      </Box>
    </Box>
  );
}
