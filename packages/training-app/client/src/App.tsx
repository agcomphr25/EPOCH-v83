import React from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import {
  AppShell,
  NavLink,
  Title,
  Group,
  ThemeIcon,
  Text,
  Box,
  Container,
} from "@mantine/core";
import {
  IconHome,
  IconClipboardCheck,
  IconBooks,
  IconChartBar,
  IconPrinter,
  IconQuestionMark,
  IconCalendarEvent,
  IconSchool,
} from "@tabler/icons-react";
import TrainerToday from "./pages/TrainerToday";
import PrintSheet from "./pages/PrintSheet";
import TraineeQuiz from "./pages/TraineeQuiz";
import Library from "./pages/Library";
import TrainingHistory from "./pages/TrainingHistory";
import TrainingPlans from "./pages/TrainingPlans";
import TrainerTraining from "./pages/TrainerTraining";
import TVDisplay from "./pages/TVDisplay";

const navItems = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/trainer", label: "Trainer Dashboard", icon: IconClipboardCheck },
  { href: "/plans", label: "Training Plans", icon: IconCalendarEvent },
  { href: "/library", label: "Content Library", icon: IconBooks },
  { href: "/history", label: "Training History", icon: IconChartBar },
  { href: "/trainer-training", label: "Trainer Training", icon: IconSchool },
];

function Navigation() {
  const [location] = useLocation();

  return (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          component={Link}
          href={item.href}
          label={item.label}
          leftSection={<item.icon size={18} stroke={1.5} />}
          active={location === item.href}
          variant="filled"
        />
      ))}
    </>
  );
}

function HomePage() {
  return (
    <Container size="lg">
      <Box py="xl">
        <Title order={1} mb="md">
          Train-the-Trainer Builder
        </Title>
        <Text size="lg" c="dimmed" mb="xl">
          Manage manufacturing training programs with the 4-Step Competency Method
          and S-O-A coaching framework.
        </Text>

        <Group gap="lg" mt="xl">
          {navItems.slice(1).map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <Box
                p="xl"
                style={{
                  border: "1px solid var(--mantine-color-gray-3)",
                  borderRadius: "var(--mantine-radius-md)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  minWidth: 200,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "var(--mantine-color-teal-5)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "var(--mantine-color-gray-3)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <ThemeIcon size="xl" radius="md" variant="light" color="teal" mb="md">
                  <item.icon size={24} />
                </ThemeIcon>
                <Text fw={600}>{item.label}</Text>
              </Box>
            </Link>
          ))}
        </Group>
      </Box>
    </Container>
  );
}

export default function App() {
  const [location] = useLocation();
  const isPrintPage = location.startsWith("/print/");
  const isQuizPage = location.startsWith("/quiz/");
  const isTVPage = location === "/tv";

  if (isPrintPage || isQuizPage || isTVPage) {
    return (
      <Switch>
        <Route path="/print/:sessionId">
          <PrintSheet />
        </Route>
        <Route path="/quiz/:sessionId">
          <TraineeQuiz />
        </Route>
        <Route path="/tv">
          <TVDisplay />
        </Route>
      </Switch>
    );
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <ThemeIcon size="lg" radius="md" variant="gradient" gradient={{ from: "teal", to: "cyan" }}>
            <IconClipboardCheck size={22} />
          </ThemeIcon>
          <Title order={3} fw={600}>Train-the-Trainer</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Navigation />
      </AppShell.Navbar>

      <AppShell.Main>
        <Switch>
          <Route path="/">
            <HomePage />
          </Route>
          <Route path="/trainer">
            <TrainerToday />
          </Route>
          <Route path="/plans">
            <TrainingPlans />
          </Route>
          <Route path="/library">
            <Library />
          </Route>
          <Route path="/history">
            <TrainingHistory />
          </Route>
          <Route path="/trainer-training">
            <TrainerTraining />
          </Route>
          <Route>
            <Container>
              <Title order={1}>404 - Page Not Found</Title>
              <Link href="/">
                <Text c="teal">Go Home</Text>
              </Link>
            </Container>
          </Route>
        </Switch>
      </AppShell.Main>
    </AppShell>
  );
}
