import React, { useEffect, useState } from "react";
import {
  Container,
  Title,
  Card,
  Text,
  Button,
  Group,
  Stack,
  Badge,
  Table,
  Modal,
  TextInput,
  Select,
  MultiSelect,
  Stepper,
  ActionIcon,
  Paper,
  Grid,
  Progress,
  Divider,
  Tooltip,
  Loader,
  Alert,
} from "@mantine/core";
import {
  IconPlus,
  IconPlayerPlay,
  IconCheck,
  IconTrash,
  IconEye,
  IconCalendar,
  IconUser,
  IconBook,
  IconChevronRight,
  IconChevronLeft,
} from "@tabler/icons-react";

type Trainee = { id: string; name: string; roleId?: string | null };
type Task = { id: string; name: string };
type FacilityTopic = { id: string; code: string; title: string };
type TrainingPlan = {
  id: string;
  traineeId: string;
  trainerName: string;
  title: string;
  startDate?: string;
  status: string;
  notes?: string;
  createdAt: string;
  trainee?: Trainee;
};

type PlanDay = {
  id: string;
  dayNumber: number;
  stepFocus: string;
  objectives?: string;
  status: string;
  tasks: Array<{ taskId: string; task?: Task }>;
  topics: Array<{ facilityTopicId: string; baselineLevel: string; targetLevel: string; topic?: FacilityTopic }>;
  session?: any;
};

type PlanWithDetails = TrainingPlan & { days: PlanDay[] };

const KNOWLEDGE_LEVELS = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "gray",
  scheduled: "blue",
  in_progress: "orange",
  completed: "green",
  cancelled: "red",
};

export default function TrainingPlans() {
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [topics, setTopics] = useState<FacilityTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<PlanWithDetails | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Wizard form state
  const [formTraineeId, setFormTraineeId] = useState<string | null>(null);
  const [formTrainerName, setFormTrainerName] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formTaskIds, setFormTaskIds] = useState<string[]>([]);
  const [formTopicConfigs, setFormTopicConfigs] = useState<Array<{ topicId: string; targetLevel: string; days: number[] }>>([]);

  async function loadData() {
    setLoading(true);
    const [plansData, traineesData, tasksData, topicsData] = await Promise.all([
      fetch("/api/plans").then(r => r.json()),
      fetch("/api/trainees").then(r => r.json()),
      fetch("/api/library/tasks").then(r => r.json()),
      fetch("/api/library/facility-topics").then(r => r.json()),
    ]);
    
    // Load trainee details for each plan
    const plansWithTrainees = await Promise.all(plansData.map(async (p: TrainingPlan) => {
      const trainee = traineesData.find((t: Trainee) => t.id === p.traineeId);
      return { ...p, trainee };
    }));
    
    setPlans(plansWithTrainees);
    setTrainees(traineesData);
    setTasks(tasksData);
    setTopics(topicsData);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadPlanDetails(planId: string) {
    const data = await fetch(`/api/plans/${planId}`).then(r => r.json());
    setViewPlan(data);
  }

  async function createPlan() {
    if (!formTraineeId || !formTrainerName || !formTitle) return;
    
    await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traineeId: formTraineeId,
        trainerName: formTrainerName,
        title: formTitle,
        startDate: formStartDate || null,
        taskIds: formTaskIds,
        topicConfigs: formTopicConfigs.map(tc => ({
          topicId: tc.topicId,
          targetLevel: tc.targetLevel,
          days: tc.days.length > 0 ? tc.days : [1, 2, 3, 4]
        }))
      })
    });
    
    resetForm();
    setCreateOpen(false);
    loadData();
  }

  function resetForm() {
    setWizardStep(0);
    setFormTraineeId(null);
    setFormTrainerName("");
    setFormTitle("");
    setFormStartDate("");
    setFormTaskIds([]);
    setFormTopicConfigs([]);
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this training plan?")) return;
    await fetch(`/api/plans/${id}`, { method: "DELETE" });
    loadData();
  }

  async function startDay(planId: string, dayNumber: number) {
    await fetch(`/api/plans/${planId}/days/${dayNumber}/start`, { method: "POST" });
    loadPlanDetails(planId);
    loadData(); // Refresh list to show updated status
  }

  async function completeDay(planId: string, dayNumber: number) {
    await fetch(`/api/plans/${planId}/days/${dayNumber}/complete`, { method: "POST" });
    loadPlanDetails(planId);
    loadData(); // Refresh list to show updated status
  }

  function addTopicConfig(topicId: string) {
    if (formTopicConfigs.find(tc => tc.topicId === topicId)) return;
    setFormTopicConfigs([...formTopicConfigs, { topicId, targetLevel: "basic", days: [1, 2, 3, 4] }]);
  }

  function updateTopicConfig(topicId: string, field: string, value: any) {
    setFormTopicConfigs(formTopicConfigs.map(tc => 
      tc.topicId === topicId ? { ...tc, [field]: value } : tc
    ));
  }

  function removeTopicConfig(topicId: string) {
    setFormTopicConfigs(formTopicConfigs.filter(tc => tc.topicId !== topicId));
  }

  const getPlanProgress = (plan: TrainingPlan) => {
    if (plan.status === "completed") return 100;
    if (plan.status === "draft" || plan.status === "scheduled") return 0;
    return 50;
  };

  if (loading) {
    return (
      <Container>
        <Group justify="center" py="xl">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>4-Day Training Plans</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          New Training Plan
        </Button>
      </Group>

      <Text c="dimmed" mb="md">
        Create structured 4-day training programs using the 4-Step Competency Method with integrated facility topics.
      </Text>

      <Group mb="lg">
        <Select
          placeholder="Filter by status"
          clearable
          data={[
            { value: "draft", label: "Draft" },
            { value: "scheduled", label: "Scheduled" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          w={200}
        />
        {statusFilter && (
          <Text size="sm" c="dimmed">
            Showing {plans.filter(p => p.status === statusFilter).length} of {plans.length} plans
          </Text>
        )}
      </Group>

      {(statusFilter ? plans.filter(p => p.status === statusFilter) : plans).length === 0 ? (
        <Card withBorder p="xl" ta="center">
          <Text c="dimmed" mb="md">{statusFilter ? `No ${statusFilter.replace("_", " ")} plans` : "No training plans yet"}</Text>
          {!statusFilter && <Button variant="light" onClick={() => setCreateOpen(true)}>Create Your First Plan</Button>}
        </Card>
      ) : (
        <Stack gap="md">
          {(statusFilter ? plans.filter(p => p.status === statusFilter) : plans).map(plan => (
            <Card key={plan.id} withBorder shadow="sm">
              <Group justify="space-between" mb="sm">
                <Group>
                  <div>
                    <Text fw={600} size="lg">{plan.title}</Text>
                    <Group gap="xs">
                      <IconUser size={14} />
                      <Text size="sm" c="dimmed">{plan.trainee?.name || "Unknown trainee"}</Text>
                      <Text size="sm" c="dimmed">|</Text>
                      <Text size="sm" c="dimmed">Trainer: {plan.trainerName}</Text>
                    </Group>
                  </div>
                </Group>
                <Group>
                  <Badge color={STATUS_COLORS[plan.status]} variant="light">
                    {plan.status.replace("_", " ")}
                  </Badge>
                  <ActionIcon variant="light" color="blue" onClick={() => loadPlanDetails(plan.id)}>
                    <IconEye size={16} />
                  </ActionIcon>
                  <ActionIcon variant="light" color="red" onClick={() => deletePlan(plan.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
              <Progress value={getPlanProgress(plan)} size="sm" color="teal" />
            </Card>
          ))}
        </Stack>
      )}

      <Modal opened={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="Create 4-Day Training Plan" size="lg">
        <Stepper active={wizardStep} onStepClick={setWizardStep}>
          <Stepper.Step label="Basics" description="Trainee & Trainer">
            <Stack gap="md" mt="md">
              <Select
                label="Trainee"
                placeholder="Select trainee"
                data={trainees.map(t => ({ value: t.id, label: t.name }))}
                value={formTraineeId}
                onChange={setFormTraineeId}
                required
              />
              <TextInput
                label="Trainer Name"
                placeholder="Enter trainer name"
                value={formTrainerName}
                onChange={e => setFormTrainerName(e.target.value)}
                required
              />
              <TextInput
                label="Plan Title"
                placeholder="e.g., Composite Layup Training"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                required
              />
              <TextInput
                label="Start Date (optional)"
                type="date"
                value={formStartDate}
                onChange={e => setFormStartDate(e.target.value)}
              />
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Tasks" description="Select training tasks">
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Select the tasks to train. These will be practiced progressively over the 4 days using the 4-Step Method.
              </Text>
              <MultiSelect
                label="Training Tasks"
                placeholder="Select tasks"
                data={tasks.map(t => ({ value: t.id, label: t.name }))}
                value={formTaskIds}
                onChange={setFormTaskIds}
                searchable
              />
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Topics" description="Facility topics & levels">
            <Stack gap="md" mt="md">
              <Text size="sm" c="dimmed">
                Add facility topics with target knowledge levels. Cross-training trainees can achieve deeper levels.
              </Text>
              <Select
                placeholder="Add a facility topic"
                data={topics.filter(t => !formTopicConfigs.find(tc => tc.topicId === t.id)).map(t => ({ value: t.id, label: `${t.code} - ${t.title}` }))}
                onChange={(v) => v && addTopicConfig(v)}
                clearable
              />
              {formTopicConfigs.length > 0 && (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Topic</Table.Th>
                      <Table.Th>Target Level</Table.Th>
                      <Table.Th w={60}></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {formTopicConfigs.map(tc => {
                      const topic = topics.find(t => t.id === tc.topicId);
                      return (
                        <Table.Tr key={tc.topicId}>
                          <Table.Td>{topic?.code} - {topic?.title}</Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              data={KNOWLEDGE_LEVELS.filter(l => l.value !== "none")}
                              value={tc.targetLevel}
                              onChange={(v) => v && updateTopicConfig(tc.topicId, "targetLevel", v)}
                            />
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon color="red" variant="light" onClick={() => removeTopicConfig(tc.topicId)}>
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Stepper.Step>

          <Stepper.Completed>
            <Stack gap="md" mt="md">
              <Alert color="green" variant="light">
                Ready to create your 4-day training plan!
              </Alert>
              <Text size="sm">
                <strong>Trainee:</strong> {trainees.find(t => t.id === formTraineeId)?.name}
              </Text>
              <Text size="sm">
                <strong>Trainer:</strong> {formTrainerName}
              </Text>
              <Text size="sm">
                <strong>Tasks:</strong> {formTaskIds.length} selected
              </Text>
              <Text size="sm">
                <strong>Topics:</strong> {formTopicConfigs.length} configured
              </Text>
            </Stack>
          </Stepper.Completed>
        </Stepper>

        <Group justify="space-between" mt="xl">
          <Button variant="default" onClick={() => setWizardStep(s => Math.max(0, s - 1))} disabled={wizardStep === 0}>
            <IconChevronLeft size={16} />
          </Button>
          {wizardStep < 3 ? (
            <Button onClick={() => setWizardStep(s => s + 1)} rightSection={<IconChevronRight size={16} />}>
              Next
            </Button>
          ) : (
            <Button color="teal" onClick={createPlan} disabled={!formTraineeId || !formTrainerName || !formTitle}>
              Create Plan
            </Button>
          )}
        </Group>
      </Modal>

      <Modal opened={!!viewPlan} onClose={() => setViewPlan(null)} title={viewPlan?.title || "Plan Details"} size="xl">
        {viewPlan && (
          <Stack gap="md">
            <Group>
              <Badge color={STATUS_COLORS[viewPlan.status]} size="lg">{viewPlan.status.replace("_", " ")}</Badge>
              <Text size="sm" c="dimmed">Trainee: {viewPlan.trainee?.name}</Text>
              <Text size="sm" c="dimmed">|</Text>
              <Text size="sm" c="dimmed">Trainer: {viewPlan.trainerName}</Text>
            </Group>

            <Divider label="4-Day Training Schedule" labelPosition="center" />

            <Grid>
              {viewPlan.days.map(day => (
                <Grid.Col span={6} key={day.id}>
                  <Card withBorder h="100%">
                    <Group justify="space-between" mb="sm">
                      <Badge variant="filled" color={day.status === "completed" ? "green" : day.status === "in_progress" ? "orange" : "gray"}>
                        Day {day.dayNumber}
                      </Badge>
                      {day.status === "completed" && <IconCheck color="green" size={18} />}
                    </Group>
                    <Text size="sm" fw={600} mb="xs">{day.stepFocus}</Text>
                    
                    {day.tasks.length > 0 && (
                      <Text size="xs" c="dimmed" mb="xs">
                        Tasks: {day.tasks.map(t => t.task?.name).join(", ")}
                      </Text>
                    )}
                    
                    {day.topics.length > 0 && (
                      <Group gap="xs" mb="sm">
                        {day.topics.map(t => (
                          <Badge key={t.facilityTopicId} size="xs" variant="light">
                            {t.topic?.code}: {t.targetLevel}
                          </Badge>
                        ))}
                      </Group>
                    )}

                    <Group mt="auto">
                      {day.status === "pending" && (
                        <Button size="xs" leftSection={<IconPlayerPlay size={14} />} onClick={() => startDay(viewPlan.id, day.dayNumber)}>
                          Start Day
                        </Button>
                      )}
                      {day.status === "in_progress" && (
                        <>
                          {day.session && (
                            <Button size="xs" variant="light" component="a" href={`/trainer?session=${day.session.id}`}>
                              Open Session
                            </Button>
                          )}
                          <Button size="xs" color="green" leftSection={<IconCheck size={14} />} onClick={() => completeDay(viewPlan.id, day.dayNumber)}>
                            Complete
                          </Button>
                        </>
                      )}
                    </Group>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
