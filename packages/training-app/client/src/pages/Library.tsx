import React, { useEffect, useState } from "react";
import {
  Container,
  Title,
  Tabs,
  Card,
  TextInput,
  Textarea,
  Select,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Table,
  Box,
  FileInput,
  Alert,
  Divider,
  Tooltip,
} from "@mantine/core";
import { IconTrash, IconPlus, IconUpload, IconWand, IconLoader, IconPencil, IconCheck, IconX } from "@tabler/icons-react";

type Department = { id: string; name: string };
type Role = { id: string; name: string; description?: string | null };
type WorkInstruction = { id: string; wiCode: string; title: string; body?: string | null; revision: string };
type Task = { id: string; name: string; departmentId?: string | null; workInstructionId?: string | null };
type CriticalPoint = { id: string; workInstructionId: string; label: string; detail?: string | null; severity: string };
type RoleTask = { id: string; roleId: string; taskId: string; sortOrder: number; required: boolean };
type FacilityTopic = { id: string; code: string; title: string; overview?: string | null };
type QuizQuestion = { id: string; topicId?: string | null; taskId?: string | null; question: string; type: string; meta: any };
type Trainee = { id: string; name: string; roleId?: string | null };

export default function Library() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [workInstructions, setWorkInstructions] = useState<WorkInstruction[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [criticalPoints, setCriticalPoints] = useState<CriticalPoint[]>([]);
  const [roleTasks, setRoleTasks] = useState<RoleTask[]>([]);
  const [facilityTopics, setFacilityTopics] = useState<FacilityTopic[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);

  async function loadAll() {
    const [depts, rolesData, wis, tasksData, cps, rts, topics, questions, traineeData] = await Promise.all([
      fetch("/api/library/departments").then(r => r.json()),
      fetch("/api/library/roles").then(r => r.json()),
      fetch("/api/library/work-instructions").then(r => r.json()),
      fetch("/api/library/tasks").then(r => r.json()),
      fetch("/api/library/critical-points").then(r => r.json()),
      fetch("/api/library/role-tasks").then(r => r.json()),
      fetch("/api/library/facility-topics").then(r => r.json()),
      fetch("/api/library/quiz-questions").then(r => r.json()),
      fetch("/api/trainees").then(r => r.json())
    ]);
    setDepartments(depts);
    setRoles(rolesData);
    setWorkInstructions(wis);
    setAllTasks(tasksData);
    setCriticalPoints(cps);
    setRoleTasks(rts);
    setFacilityTopics(topics);
    setQuizQuestions(questions);
    setTrainees(traineeData);
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <Container size="lg">
      <Title order={2} mb="lg">Content Library</Title>

      <Tabs defaultValue="departments" variant="pills">
        <Tabs.List mb="lg">
          <Tabs.Tab value="departments">Departments</Tabs.Tab>
          <Tabs.Tab value="roles">Roles</Tabs.Tab>
          <Tabs.Tab value="work-instructions">Work Instructions</Tabs.Tab>
          <Tabs.Tab value="tasks">Tasks</Tabs.Tab>
          <Tabs.Tab value="critical-points">Critical Points</Tabs.Tab>
          <Tabs.Tab value="role-tasks">Role-Tasks</Tabs.Tab>
          <Tabs.Tab value="facility-topics">Facility Topics</Tabs.Tab>
          <Tabs.Tab value="quiz-questions">Quiz Questions</Tabs.Tab>
          <Tabs.Tab value="trainees">Trainees</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="departments">
          <DepartmentsTab departments={departments} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="roles">
          <RolesTab roles={roles} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="work-instructions">
          <WorkInstructionsTab workInstructions={workInstructions} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="tasks">
          <TasksTab tasks={allTasks} departments={departments} workInstructions={workInstructions} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="critical-points">
          <CriticalPointsTab criticalPoints={criticalPoints} workInstructions={workInstructions} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="role-tasks">
          <RoleTasksTab roleTasks={roleTasks} roles={roles} tasks={allTasks} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="facility-topics">
          <FacilityTopicsTab topics={facilityTopics} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="quiz-questions">
          <QuizQuestionsTab questions={quizQuestions} topics={facilityTopics} tasks={allTasks} reload={loadAll} />
        </Tabs.Panel>
        <Tabs.Panel value="trainees">
          <TraineesTab trainees={trainees} roles={roles} reload={loadAll} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}

function DepartmentsTab({ departments, reload }: { departments: Department[]; reload: () => void }) {
  const [name, setName] = useState("");
  async function create() {
    if (!name.trim()) return;
    await fetch("/api/library/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName(""); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/departments/${id}`, { method: "DELETE" }); reload();
  }
  return (
    <Stack>
      <Card>
        <Group>
          <TextInput flex={1} value={name} onChange={e => setName(e.target.value)} placeholder="Department name" />
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add</Button>
        </Group>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {departments.map(d => (
            <Table.Tr key={d.id}>
              <Table.Td>{d.name}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(d.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function RolesTab({ roles, reload }: { roles: Role[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  async function create() {
    if (!name.trim()) return;
    await fetch("/api/library/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: desc }) });
    setName(""); setDesc(""); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/roles/${id}`, { method: "DELETE" }); reload();
  }
  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Role name" />
          <TextInput value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" />
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add Role</Button>
        </Stack>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {roles.map(r => (
            <Table.Tr key={r.id}>
              <Table.Td fw={600}>{r.name}</Table.Td>
              <Table.Td c="dimmed">{r.description || "—"}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(r.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function WorkInstructionsTab({ workInstructions, reload }: { workInstructions: WorkInstruction[]; reload: () => void }) {
  const [wiCode, setWiCode] = useState("");
  const [title, setTitle] = useState("");
  const [revision, setRevision] = useState("A");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ jobId?: string; status?: string; message?: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  async function create() {
    if (!wiCode.trim() || !title.trim()) return;
    await fetch("/api/library/work-instructions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wiCode, title, revision }) });
    setWiCode(""); setTitle(""); setRevision("A"); reload();
  }

  async function importPdf() {
    if (!pdfFile || !wiCode.trim() || !title.trim()) return;
    setImporting(true);
    setImportStatus(null);
    const formData = new FormData();
    formData.append("file", pdfFile);
    formData.append("wiCode", wiCode);
    formData.append("title", title);
    formData.append("revision", revision);
    try {
      const r = await fetch("/api/import/work-instructions/import", { method: "POST", body: formData });
      const data = await r.json();
      setImportStatus(data);
      if (data.jobId) {
        pollJobStatus(data.jobId);
      }
      setWiCode(""); setTitle(""); setRevision("A"); setPdfFile(null);
      reload();
    } catch (e: any) {
      setImportStatus({ status: "error", message: e.message });
    }
    setImporting(false);
  }

  async function pollJobStatus(jobId: string) {
    const interval = setInterval(async () => {
      const r = await fetch(`/api/import/work-instructions/import/${jobId}`);
      const data = await r.json();
      setImportStatus(data);
      if (data.status === "completed" || data.status === "failed") {
        clearInterval(interval);
        reload();
      }
    }, 2000);
  }

  async function generateQuiz(wiId: string) {
    setGenerating(wiId);
    try {
      await fetch(`/api/import/work-instructions/${wiId}/generate-quiz`, { method: "POST" });
      reload();
    } catch (e) {
      console.error("Quiz generation failed:", e);
    }
    setGenerating(null);
  }

  async function remove(id: string) {
    await fetch(`/api/library/work-instructions/${id}`, { method: "DELETE" }); reload();
  }

  return (
    <Stack>
      <Card>
        <Text fw={600} mb="sm">Import from PDF (AI extracts critical points + generates quiz)</Text>
        <Group grow>
          <TextInput value={wiCode} onChange={e => setWiCode(e.target.value)} placeholder="WI Code (e.g. WI-CT-001)" />
          <TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
          <TextInput w={100} value={revision} onChange={e => setRevision(e.target.value)} placeholder="Rev" />
        </Group>
        <Group mt="sm">
          <input
            type="file"
            accept=".pdf"
            onChange={e => setPdfFile(e.target.files?.[0] || null)}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={importing ? <IconLoader size={16} /> : <IconUpload size={16} />}
            onClick={importPdf}
            disabled={!pdfFile || !wiCode.trim() || !title.trim() || importing}
            loading={importing}
          >
            Import PDF + AI Analysis
          </Button>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={create} disabled={!wiCode.trim() || !title.trim()}>
            Add Manual
          </Button>
        </Group>
        {importStatus && (
          <Box mt="sm" p="sm" style={{ background: importStatus.status === "failed" ? "#fee" : importStatus.status === "completed" ? "#efe" : "#eef", borderRadius: 8 }}>
            <Text size="sm" fw={500}>
              Status: {importStatus.status}
              {importStatus.status === "completed" && ` - ${(importStatus as any).criticalPointsGenerated || 0} critical points, ${(importStatus as any).quizQuestionsGenerated || 0} quiz questions generated`}
            </Text>
            {importStatus.message && <Text size="xs" c="dimmed">{importStatus.message}</Text>}
          </Box>
        )}
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Title</Table.Th>
            <Table.Th>Revision</Table.Th>
            <Table.Th w={160}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {workInstructions.map(wi => (
            <Table.Tr key={wi.id}>
              <Table.Td><Badge variant="light">{wi.wiCode}</Badge></Table.Td>
              <Table.Td>{wi.title}</Table.Td>
              <Table.Td><Badge variant="outline" color="gray">Rev {wi.revision}</Badge></Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <ActionIcon
                    color="teal"
                    variant="light"
                    onClick={() => generateQuiz(wi.id)}
                    disabled={generating === wi.id}
                    title="Generate AI Quiz from Critical Points"
                  >
                    {generating === wi.id ? <IconLoader size={16} /> : <IconWand size={16} />}
                  </ActionIcon>
                  <ActionIcon color="red" variant="light" onClick={() => remove(wi.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function TasksTab({ tasks, departments, workInstructions, reload }: { tasks: Task[]; departments: Department[]; workInstructions: WorkInstruction[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState<string | null>(null);
  const [wiId, setWiId] = useState<string | null>(null);
  async function create() {
    if (!name.trim()) return;
    await fetch("/api/library/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, departmentId: deptId, workInstructionId: wiId }) });
    setName(""); setDeptId(null); setWiId(null); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/tasks/${id}`, { method: "DELETE" }); reload();
  }
  const getDept = (id: string) => departments.find(d => d.id === id)?.name || "";
  const getWI = (id: string) => workInstructions.find(w => w.id === id)?.wiCode || "";
  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Task name" />
          <Group grow>
            <Select
              clearable
              placeholder="Select department"
              data={departments.map(d => ({ value: d.id, label: d.name }))}
              value={deptId}
              onChange={setDeptId}
            />
            <Select
              clearable
              placeholder="Select work instruction"
              data={workInstructions.map(wi => ({ value: wi.id, label: `${wi.wiCode} - ${wi.title}` }))}
              value={wiId}
              onChange={setWiId}
            />
          </Group>
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add Task</Button>
        </Stack>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Department</Table.Th>
            <Table.Th>Work Instruction</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map(t => (
            <Table.Tr key={t.id}>
              <Table.Td fw={600}>{t.name}</Table.Td>
              <Table.Td>{t.departmentId ? <Badge variant="light" color="gray">{getDept(t.departmentId)}</Badge> : "—"}</Table.Td>
              <Table.Td>{t.workInstructionId ? <Badge variant="light" color="blue">{getWI(t.workInstructionId)}</Badge> : "—"}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(t.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CriticalPointsTab({ criticalPoints, workInstructions, reload }: { criticalPoints: CriticalPoint[]; workInstructions: WorkInstruction[]; reload: () => void }) {
  const [wiId, setWiId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState<string | null>("major");
  async function create() {
    if (!wiId || !label.trim()) return;
    await fetch("/api/library/critical-points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workInstructionId: wiId, label, detail, severity }) });
    setLabel(""); setDetail(""); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/critical-points/${id}`, { method: "DELETE" }); reload();
  }
  const getWI = (id: string) => workInstructions.find(w => w.id === id)?.wiCode || "";
  const getSeverityColor = (s: string) => s === "critical" ? "red" : s === "major" ? "orange" : "green";
  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <Select
            placeholder="Select work instruction"
            data={workInstructions.map(wi => ({ value: wi.id, label: `${wi.wiCode} - ${wi.title}` }))}
            value={wiId}
            onChange={setWiId}
          />
          <Group grow>
            <TextInput value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (short name)" />
            <Select
              data={[{ value: "minor", label: "Minor" }, { value: "major", label: "Major" }, { value: "critical", label: "Critical" }]}
              value={severity}
              onChange={setSeverity}
            />
          </Group>
          <TextInput value={detail} onChange={e => setDetail(e.target.value)} placeholder="Detail (what/why)" />
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add Critical Point</Button>
        </Stack>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Work Instruction</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th>Detail</Table.Th>
            <Table.Th>Severity</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {criticalPoints.map(cp => (
            <Table.Tr key={cp.id}>
              <Table.Td><Badge variant="light" color="gray">{getWI(cp.workInstructionId)}</Badge></Table.Td>
              <Table.Td fw={600}>{cp.label}</Table.Td>
              <Table.Td c="dimmed">{cp.detail || "—"}</Table.Td>
              <Table.Td><Badge color={getSeverityColor(cp.severity)}>{cp.severity}</Badge></Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(cp.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function RoleTasksTab({ roleTasks, roles, tasks, reload }: { roleTasks: RoleTask[]; roles: Role[]; tasks: Task[]; reload: () => void }) {
  const [roleId, setRoleId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  async function create() {
    if (!roleId || !taskId) return;
    await fetch("/api/library/role-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, taskId }) });
    reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/role-tasks/${id}`, { method: "DELETE" }); reload();
  }
  const getRole = (id: string) => roles.find(r => r.id === id)?.name || "";
  const getTask = (id: string) => tasks.find(t => t.id === id)?.name || "";
  return (
    <Stack>
      <Text c="dimmed" size="sm">Assign which tasks belong to each role/position.</Text>
      <Card>
        <Group grow>
          <Select
            placeholder="Select role"
            data={roles.map(r => ({ value: r.id, label: r.name }))}
            value={roleId}
            onChange={setRoleId}
          />
          <Select
            placeholder="Select task"
            data={tasks.map(t => ({ value: t.id, label: t.name }))}
            value={taskId}
            onChange={setTaskId}
          />
        </Group>
        <Button mt="sm" leftSection={<IconPlus size={16} />} onClick={create}>Assign Task</Button>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Role</Table.Th>
            <Table.Th>Task</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {roleTasks.map(rt => (
            <Table.Tr key={rt.id}>
              <Table.Td fw={600}>{getRole(rt.roleId)}</Table.Td>
              <Table.Td>{getTask(rt.taskId)}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(rt.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function FacilityTopicsTab({ topics, reload }: { topics: FacilityTopic[]; reload: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [overview, setOverview] = useState("");
  
  const [importCode, setImportCode] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ status: string; jobId?: string; error?: string; questionsGenerated?: number } | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState<string | null>(null);

  async function create() {
    if (!code.trim() || !title.trim()) return;
    await fetch("/api/library/facility-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, title, overview }) });
    setCode(""); setTitle(""); setOverview(""); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/facility-topics/${id}`, { method: "DELETE" }); reload();
  }

  async function importDocument() {
    if (!importFile || !importCode.trim() || !importTitle.trim()) return;
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("code", importCode);
    formData.append("title", importTitle);
    setImportStatus({ status: "uploading" });
    try {
      const res = await fetch("/api/import/facility-topics/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportStatus({ status: data.status, jobId: data.jobId });
      pollImportStatus(data.jobId);
    } catch (err: any) {
      setImportStatus({ status: "failed", error: err.message });
    }
  }

  async function pollImportStatus(jobId: string) {
    const poll = async () => {
      const res = await fetch(`/api/import/facility-topics/import/${jobId}`);
      const data = await res.json();
      setImportStatus({ status: data.status, jobId, error: data.error, questionsGenerated: data.quizQuestionsGenerated });
      if (data.status === "processing") {
        setTimeout(poll, 2000);
      } else {
        reload();
        if (data.status === "completed") {
          setImportFile(null);
          setImportCode("");
          setImportTitle("");
        }
      }
    };
    poll();
  }

  async function regenerateQuiz(topicId: string) {
    setGeneratingQuiz(topicId);
    try {
      await fetch(`/api/import/facility-topics/${topicId}/generate-quiz`, { method: "POST" });
      reload();
    } finally {
      setGeneratingQuiz(null);
    }
  }

  return (
    <Stack>
      <Text c="dimmed" size="sm">Safety and compliance topics (PPE, FOD, ITAR, etc.)</Text>
      
      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600} size="sm">Import Document + Generate Quiz (AI)</Text>
          <Group grow>
            <TextInput value={importCode} onChange={e => setImportCode(e.target.value)} placeholder="Topic Code (e.g. PPE, FOD, ITAR)" />
            <TextInput value={importTitle} onChange={e => setImportTitle(e.target.value)} placeholder="Title" />
          </Group>
          <FileInput
            placeholder="Upload PDF or text file with topic information"
            accept=".pdf,.txt,.doc,.docx"
            value={importFile}
            onChange={setImportFile}
          />
          <Button leftSection={<IconUpload size={16} />} onClick={importDocument} loading={importStatus?.status === "uploading" || importStatus?.status === "processing"}>
            Import + AI Quiz Generation
          </Button>
          {importStatus && (
            <Alert color={importStatus.status === "completed" ? "green" : importStatus.status === "failed" ? "red" : "blue"} variant="light">
              {importStatus.status === "completed" && `Import complete! Generated ${importStatus.questionsGenerated || 0} quiz questions.`}
              {importStatus.status === "processing" && "AI is generating quiz questions..."}
              {importStatus.status === "uploading" && "Uploading document..."}
              {importStatus.status === "failed" && `Error: ${importStatus.error}`}
            </Alert>
          )}
        </Stack>
      </Card>

      <Divider label="OR Add Manually" labelPosition="center" />

      <Card>
        <Stack gap="sm">
          <Group grow>
            <TextInput value={code} onChange={e => setCode(e.target.value)} placeholder="Code (e.g. PPE)" />
            <TextInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
          </Group>
          <TextInput value={overview} onChange={e => setOverview(e.target.value)} placeholder="Overview (optional)" />
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add Topic</Button>
        </Stack>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            <Table.Th>Title</Table.Th>
            <Table.Th w={120}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {topics.map(t => (
            <Table.Tr key={t.id}>
              <Table.Td><Badge variant="light">{t.code}</Badge></Table.Td>
              <Table.Td>{t.title}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Tooltip label="Regenerate Quiz (AI)">
                    <ActionIcon color="blue" variant="light" onClick={() => regenerateQuiz(t.id)} loading={generatingQuiz === t.id}>
                      <IconWand size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <ActionIcon color="red" variant="light" onClick={() => remove(t.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function QuizQuestionsTab({ questions, topics, tasks, reload }: { questions: QuizQuestion[]; topics: FacilityTopic[]; tasks: Task[]; reload: () => void }) {
  const [topicId, setTopicId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<string | null>("MCQ");
  const [choices, setChoices] = useState("A,B,C,D");
  const [answer, setAnswer] = useState("");

  async function create() {
    if (!question.trim()) return;
    const meta: any = {};
    if (type === "MCQ") {
      meta.choices = choices.split(",").map(c => c.trim());
      meta.answer = answer;
    } else if (type === "TF") {
      meta.answer = answer;
    }
    await fetch("/api/library/quiz-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, taskId, question, type, meta })
    });
    setQuestion(""); setAnswer(""); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/library/quiz-questions/${id}`, { method: "DELETE" }); reload();
  }
  const getTopic = (id: string) => topics.find(t => t.id === id)?.code || "";
  const getTask = (id: string) => tasks.find(t => t.id === id)?.name || "";

  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <Group grow>
            <Select
              clearable
              placeholder="Facility topic (optional)"
              data={topics.map(t => ({ value: t.id, label: `${t.code} - ${t.title}` }))}
              value={topicId}
              onChange={v => { setTopicId(v); setTaskId(null); }}
            />
            <Select
              clearable
              placeholder="Task (optional)"
              data={tasks.map(t => ({ value: t.id, label: t.name }))}
              value={taskId}
              onChange={v => { setTaskId(v); setTopicId(null); }}
            />
          </Group>
          <Textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question text" minRows={2} />
          <Select
            data={[{ value: "MCQ", label: "Multiple Choice" }, { value: "TF", label: "True/False" }, { value: "SHORT", label: "Short Answer" }]}
            value={type}
            onChange={setType}
          />
          {type === "MCQ" && (
            <>
              <TextInput value={choices} onChange={e => setChoices(e.target.value)} placeholder="Choices (comma-separated)" />
              <TextInput value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Correct answer" />
            </>
          )}
          {type === "TF" && (
            <Select
              placeholder="Select answer"
              data={[{ value: "True", label: "True" }, { value: "False", label: "False" }]}
              value={answer}
              onChange={v => setAnswer(v || "")}
            />
          )}
          <Button leftSection={<IconPlus size={16} />} onClick={create}>Add Question</Button>
        </Stack>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Th>Topic/Task</Table.Th>
            <Table.Th>Question</Table.Th>
            <Table.Th w={80}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {questions.map(q => (
            <Table.Tr key={q.id}>
              <Table.Td><Badge variant="outline">{q.type}</Badge></Table.Td>
              <Table.Td>
                {q.topicId && <Badge variant="light" color="violet">{getTopic(q.topicId)}</Badge>}
                {q.taskId && <Badge variant="light" color="green">{getTask(q.taskId)}</Badge>}
                {!q.topicId && !q.taskId && "—"}
              </Table.Td>
              <Table.Td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{q.question}</Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="light" onClick={() => remove(q.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function TraineesTab({ trainees, roles, reload }: { trainees: Trainee[]; roles: Role[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleId, setEditRoleId] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    await fetch("/api/trainees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, roleId }) });
    setName(""); setRoleId(null); reload();
  }
  async function remove(id: string) {
    await fetch(`/api/trainees/${id}`, { method: "DELETE" }); reload();
  }
  function startEdit(t: Trainee) {
    setEditId(t.id);
    setEditName(t.name);
    setEditRoleId(t.roleId || null);
  }
  async function saveEdit() {
    if (!editId || !editName.trim()) return;
    await fetch(`/api/trainees/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, roleId: editRoleId })
    });
    setEditId(null);
    reload();
  }
  function cancelEdit() {
    setEditId(null);
  }
  const getRole = (id: string) => roles.find(r => r.id === id)?.name || "";
  return (
    <Stack>
      <Card>
        <Group grow>
          <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Trainee name" />
          <Select
            clearable
            placeholder="Assign role (optional)"
            data={roles.map(r => ({ value: r.id, label: r.name }))}
            value={roleId}
            onChange={setRoleId}
          />
        </Group>
        <Button mt="sm" leftSection={<IconPlus size={16} />} onClick={create}>Add Trainee</Button>
      </Card>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th w={120}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {trainees.map(t => (
            <Table.Tr key={t.id}>
              {editId === t.id ? (
                <>
                  <Table.Td>
                    <TextInput size="xs" value={editName} onChange={e => setEditName(e.target.value)} />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      clearable
                      placeholder="Select role"
                      data={roles.map(r => ({ value: r.id, label: r.name }))}
                      value={editRoleId}
                      onChange={setEditRoleId}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon color="green" variant="light" onClick={saveEdit}>
                        <IconCheck size={16} />
                      </ActionIcon>
                      <ActionIcon color="gray" variant="light" onClick={cancelEdit}>
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </>
              ) : (
                <>
                  <Table.Td fw={600}>{t.name}</Table.Td>
                  <Table.Td>{t.roleId ? <Badge variant="light">{getRole(t.roleId)}</Badge> : <Text size="sm" c="dimmed">No role assigned</Text>}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon color="blue" variant="light" onClick={() => startEdit(t)}>
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon color="red" variant="light" onClick={() => remove(t.id)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
