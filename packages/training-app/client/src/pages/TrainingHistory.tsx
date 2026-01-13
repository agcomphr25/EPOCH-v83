import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Container,
  Title,
  Card,
  Select,
  Group,
  Stack,
  Text,
  Badge,
  Table,
  Paper,
  ThemeIcon,
  SimpleGrid,
  ActionIcon,
  Box,
} from "@mantine/core";
import {
  IconUsers,
  IconCertificate,
  IconCalendar,
  IconEye,
  IconCheck,
  IconX,
} from "@tabler/icons-react";

type Trainee = { id: string; name: string; roleId?: string | null };
type Role = { id: string; name: string };
type Session = {
  id: string;
  traineeId: string;
  trainerName: string;
  sessionDate: string;
  competencyAttested: boolean;
  signedAt?: string | null;
};

export default function TrainingHistory() {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<string | null>(null);

  async function loadData() {
    const [traineeData, roleData, sessionData] = await Promise.all([
      fetch("/api/trainees").then(r => r.json()),
      fetch("/api/library/roles").then(r => r.json()),
      fetch("/api/training/sessions").then(r => r.ok ? r.json() : [])
    ]);
    setTrainees(traineeData);
    setRoles(roleData);
    setSessions(sessionData);
  }

  useEffect(() => { loadData(); }, []);

  const getRole = (id: string) => roles.find(r => r.id === id)?.name || "";

  const filteredSessions = selectedTrainee
    ? sessions.filter(s => s.traineeId === selectedTrainee)
    : sessions;

  const traineeStats = trainees.map(t => {
    const traineeSessions = sessions.filter(s => s.traineeId === t.id);
    const completedCount = traineeSessions.filter(s => s.competencyAttested).length;
    return {
      ...t,
      totalSessions: traineeSessions.length,
      completedSessions: completedCount,
      lastSession: traineeSessions.length > 0
        ? new Date(traineeSessions[traineeSessions.length - 1].sessionDate).toLocaleDateString()
        : "Never"
    };
  });

  const totalSessions = sessions.length;
  const attestedSessions = sessions.filter(s => s.competencyAttested).length;
  const attestationRate = totalSessions > 0 ? Math.round((attestedSessions / totalSessions) * 100) : 0;

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Training History</Title>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
        <Card>
          <Group>
            <ThemeIcon size="xl" radius="md" variant="light">
              <IconUsers size={24} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Trainees</Text>
              <Text size="xl" fw={700}>{trainees.length}</Text>
            </div>
          </Group>
        </Card>
        <Card>
          <Group>
            <ThemeIcon size="xl" radius="md" variant="light" color="teal">
              <IconCalendar size={24} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Sessions</Text>
              <Text size="xl" fw={700}>{totalSessions}</Text>
            </div>
          </Group>
        </Card>
        <Card>
          <Group>
            <ThemeIcon size="xl" radius="md" variant="light" color="green">
              <IconCertificate size={24} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Attestation Rate</Text>
              <Text size="xl" fw={700}>{attestationRate}%</Text>
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      <Card mb="xl">
        <Title order={4} mb="md">Trainee Progress</Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Trainee</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th ta="center">Sessions</Table.Th>
              <Table.Th ta="center">Attested</Table.Th>
              <Table.Th>Last Training</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {traineeStats.map(t => (
              <Table.Tr
                key={t.id}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedTrainee(t.id === selectedTrainee ? null : t.id)}
                bg={t.id === selectedTrainee ? "var(--mantine-color-teal-light)" : undefined}
              >
                <Table.Td fw={600}>{t.name}</Table.Td>
                <Table.Td>{t.roleId ? <Badge variant="light">{getRole(t.roleId)}</Badge> : <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td ta="center">{t.totalSessions}</Table.Td>
                <Table.Td ta="center">
                  <Badge color={t.completedSessions > 0 ? "green" : "gray"} variant="light">
                    {t.completedSessions}
                  </Badge>
                </Table.Td>
                <Table.Td>{t.lastSession}</Table.Td>
              </Table.Tr>
            ))}
            {traineeStats.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5} ta="center" c="dimmed" py="xl">
                  No trainees found. Add trainees in the Content Library.
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Card>
        <Group justify="space-between" mb="md">
          <Title order={4}>Session History</Title>
          <Select
            placeholder="Filter by trainee"
            clearable
            data={trainees.map(t => ({ value: t.id, label: t.name }))}
            value={selectedTrainee}
            onChange={setSelectedTrainee}
            style={{ width: 200 }}
          />
        </Group>

        {filteredSessions.length === 0 ? (
          <Paper p="xl" ta="center" c="dimmed" withBorder>
            No training sessions found.
          </Paper>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Trainee</Table.Th>
                <Table.Th>Trainer</Table.Th>
                <Table.Th ta="center">Status</Table.Th>
                <Table.Th ta="center">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredSessions.map(s => {
                const trainee = trainees.find(t => t.id === s.traineeId);
                return (
                  <Table.Tr key={s.id}>
                    <Table.Td>{new Date(s.sessionDate).toLocaleDateString()}</Table.Td>
                    <Table.Td fw={500}>{trainee?.name || "—"}</Table.Td>
                    <Table.Td>{s.trainerName}</Table.Td>
                    <Table.Td ta="center">
                      {s.competencyAttested ? (
                        <Badge color="green" leftSection={<IconCheck size={12} />}>
                          Attested
                        </Badge>
                      ) : (
                        <Badge color="gray" leftSection={<IconX size={12} />}>
                          Pending
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      <ActionIcon
                        variant="light"
                        component={Link}
                        href={`/print/${s.id}`}
                      >
                        <IconEye size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Container>
  );
}
