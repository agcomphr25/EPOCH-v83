import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ExtractedCriticalPoint {
  label: string;
  detail: string;
  severity: "minor" | "major" | "critical";
}

export interface GeneratedQuizQuestion {
  question: string;
  type: "MCQ" | "TF";
  choices?: string[];
  answer: string;
}

export async function extractCriticalPointsFromText(
  wiTitle: string,
  pdfText: string
): Promise<ExtractedCriticalPoint[]> {
  const prompt = `You are an expert manufacturing training analyst. Analyze this Work Instruction document and extract the critical points that trainees must understand for safety, quality, and compliance.

Work Instruction: ${wiTitle}

Document Content:
${pdfText.slice(0, 15000)}

Extract critical points in the following categories:
- Safety hazards and precautions
- Quality checkpoints and tolerances  
- Compliance requirements (regulatory, customer specs)
- Key procedural steps that must not be skipped

For each critical point, provide:
1. A short label (3-7 words)
2. A detailed explanation of what/why
3. Severity: "minor" (good practice), "major" (quality/process impact), or "critical" (safety/compliance risk)

Respond with a JSON array of objects with keys: label, detail, severity
Only output valid JSON, no markdown formatting.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "[]";
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", content);
    return [];
  }
}

export async function generateQuizFromCriticalPoints(
  wiTitle: string,
  criticalPoints: Array<{ label: string; detail: string; severity: string }>
): Promise<GeneratedQuizQuestion[]> {
  if (criticalPoints.length === 0) return [];

  const pointsList = criticalPoints
    .map((cp, i) => `${i + 1}. [${cp.severity.toUpperCase()}] ${cp.label}: ${cp.detail}`)
    .join("\n");

  const prompt = `You are creating a training quiz for manufacturing workers based on critical points from a Work Instruction.

Work Instruction: ${wiTitle}

Critical Points:
${pointsList}

Generate quiz questions that test understanding of these critical points. Create a mix of:
- Multiple choice questions (MCQ) with 4 choices labeled A, B, C, D
- True/False questions (TF)

Focus on:
- Safety-critical information
- Quality checkpoints
- Correct procedures

For each question provide:
- question: The question text
- type: "MCQ" or "TF"
- choices: Array of 4 choices (for MCQ only, omit for TF)
- answer: The correct answer ("A", "B", "C", "D" for MCQ, or "True"/"False" for TF)

Generate 5-8 questions total. Respond with a JSON array only, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "[]";
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse quiz response:", content);
    return [];
  }
}

export async function generateQuizFromFacilityTopic(
  topicCode: string,
  topicTitle: string,
  documentText: string
): Promise<GeneratedQuizQuestion[]> {
  const prompt = `You are creating a training quiz for manufacturing facility standards. This quiz tests understanding of facility-wide requirements that all workers must know.

Facility Topic: ${topicCode} - ${topicTitle}

Document Content:
${documentText.slice(0, 15000)}

Generate quiz questions that test understanding of this facility topic. Create a mix of:
- Multiple choice questions (MCQ) with 4 choices labeled A, B, C, D
- True/False questions (TF)

Focus on:
- Key requirements and rules
- Safety and compliance aspects
- Correct procedures and behaviors
- Common violations to avoid

For each question provide:
- question: The question text
- type: "MCQ" or "TF"
- choices: Array of 4 choices (for MCQ only, omit for TF)
- answer: The correct answer ("A", "B", "C", "D" for MCQ, or "True"/"False" for TF)

Generate 6-10 questions total. Respond with a JSON array only, no markdown.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content || "[]";
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse facility quiz response:", content);
    return [];
  }
}
