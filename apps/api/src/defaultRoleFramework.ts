/**
 * Default PE Engineering career framework (Job Descriptions & Career Progression Chart).
 * Seeded on empty workspace init and demo seed so EMs can assign people immediately.
 * Users can still edit/add roles on the Roles page or upload another framework.
 */
export type DefaultRoleExpectation = {
  kind: "responsibility" | "expectation";
  text: string;
};

export type DefaultRole = {
  key: string;
  title: string;
  track: "ic" | "manager" | "other";
  levelKey: string;
  summary: string;
  next: string[];
  expectations: DefaultRoleExpectation[];
};

export const DEFAULT_ROLE_FRAMEWORK = {
  name: "PE Engineering Career Framework",
  versionLabel: "2026.1",
  sourceFilename: "PE-Engineering_Job_Descriptions_Career_Progression_Chart.pdf",
  roles: [
    {
      key: "eng_ic1",
      title: "Graduate Developer",
      track: "ic" as const,
      levelKey: "IC1",
      summary:
        "Focused on learning systems, codebase, tools, and processes. Requires close mentoring; works on simple, well-defined tasks with limited autonomy. Localized impact; work reviewed before integration. Typical experience: 0–2 years.",
      next: ["eng_ic2"],
      expectations: [
        { kind: "responsibility" as const, text: "Learning Python, JavaScript, and coding fundamentals." },
        { kind: "responsibility" as const, text: "Detecting and fixing basic bugs and simple enhancements assigned by a lead." },
        {
          kind: "expectation" as const,
          text: "Demonstrates strong effort in developing core skills; work may require review but shows commitment to growth.",
        },
        {
          kind: "expectation" as const,
          text: "Delivers with support; shows reliability by actively seeking clarity and learning.",
        },
        {
          kind: "expectation" as const,
          text: "Applies basic solutions with enthusiasm and openness to learning new methods.",
        },
        {
          kind: "expectation" as const,
          text: "Engages constructively in team interactions; steadily improving confidence.",
        },
        {
          kind: "expectation" as const,
          text: "Takes growing ownership of tasks and follows through with diligence.",
        },
        { kind: "expectation" as const, text: "Progression: demonstrates basic coding proficiency and understanding of tools." },
        { kind: "expectation" as const, text: "Progression: completes assigned tasks reliably with minimal errors." },
        { kind: "expectation" as const, text: "Progression: receives and applies feedback consistently." },
        { kind: "expectation" as const, text: "Progression: begins to contribute to small team efforts or features." },
      ],
    },
    {
      key: "eng_ic2",
      title: "Junior Software Engineer",
      track: "ic" as const,
      levelKey: "IC2",
      summary:
        "Gaining confidence in coding and development processes. Tackles moderately scoped tasks under supervision; begins solving straightforward problems independently. Submits and participates in code reviews. Growing system understanding and minor decision-making. Typical experience: 2–4 years.",
      next: ["eng_ic3"],
      expectations: [
        { kind: "responsibility" as const, text: "Work on tasks of growing complexity under guidance." },
        { kind: "responsibility" as const, text: "Collaborate with peers and assist junior team members." },
        { kind: "responsibility" as const, text: "Submit and review simple code changes." },
        { kind: "responsibility" as const, text: "Start contributing meaningfully to projects." },
        {
          kind: "expectation" as const,
          text: "Approaches tasks with energy and improving efficiency; dedicated to delivering complete, quality work.",
        },
        { kind: "expectation" as const, text: "Dependably meets expectations with developing autonomy." },
        { kind: "expectation" as const, text: "Contributes solutions and seeks feedback to improve effectiveness." },
        { kind: "expectation" as const, text: "Participates thoughtfully in discussions and team rituals." },
        { kind: "expectation" as const, text: "Shows growing confidence in owning tasks and learning from outcomes." },
        { kind: "expectation" as const, text: "Progression: delivers moderately complex tasks independently." },
        { kind: "expectation" as const, text: "Progression: participates actively in team rituals and discussions." },
        { kind: "expectation" as const, text: "Progression: begins to take initiative in solving problems." },
        { kind: "expectation" as const, text: "Progression: demonstrates improved debugging and testing skills." },
      ],
    },
    {
      key: "eng_ic3",
      title: "Software Engineer",
      track: "ic" as const,
      levelKey: "IC3",
      summary:
        "Independently delivers moderately complex tasks. Offers informal mentoring to peers; participates actively in code reviews. Makes decisions within their scope of work; collaborates with stakeholders and grows domain knowledge. Typical experience: 4–6 years.",
      next: ["eng_ic4"],
      expectations: [
        { kind: "responsibility" as const, text: "Writing and reviewing code." },
        { kind: "responsibility" as const, text: "Participating in design discussions." },
        { kind: "responsibility" as const, text: "Implementing features and fixing bugs." },
        { kind: "responsibility" as const, text: "Testing, troubleshooting, and attending team meetings." },
        { kind: "responsibility" as const, text: "Participating in on-call rotations (as experienced)." },
        {
          kind: "expectation" as const,
          text: "Demonstrates consistent, high-quality output through focused effort and strong technical foundations.",
        },
        { kind: "expectation" as const, text: "Delivers reliably; takes accountability for commitments and quality." },
        { kind: "expectation" as const, text: "Applies thoughtful, practical innovations to improve results." },
        { kind: "expectation" as const, text: "Communicates effectively with the team and stakeholders." },
        { kind: "expectation" as const, text: "Owns deliverables fully and proactively manages risks." },
        { kind: "expectation" as const, text: "Progression: handles complex features and owns components." },
        { kind: "expectation" as const, text: "Progression: provides valuable feedback in reviews and design sessions." },
        { kind: "expectation" as const, text: "Progression: shows initiative in improving team workflows or practices." },
        { kind: "expectation" as const, text: "Progression: begins mentoring juniors and actively supports peers." },
      ],
    },
    {
      key: "eng_ic4",
      title: "Senior Software Engineer",
      track: "ic" as const,
      levelKey: "IC4",
      summary:
        "Acts as a technical resource and subject-matter expert. Deep understanding of system architecture and optimization; reviews code and mentors junior engineers. Makes autonomous technical decisions aligned with business goals; contributes to technical strategy and system scalability. Typical experience: 6+ years.",
      next: ["eng_ic5", "eng_l1"],
      expectations: [
        { kind: "responsibility" as const, text: "Lead or contribute to technical designs and architectural decisions." },
        { kind: "responsibility" as const, text: "Guide engineers in coding, design, and debugging." },
        { kind: "responsibility" as const, text: "Review and ensure code quality and adherence to standards." },
        {
          kind: "expectation" as const,
          text: "Sets a high bar for output quality; consistently drives results through focused and efficient effort.",
        },
        { kind: "expectation" as const, text: "Trusted for autonomous execution with strong judgment." },
        { kind: "expectation" as const, text: "Leads problem-solving with innovative, effective solutions." },
        { kind: "expectation" as const, text: "Actively mentors and leads communication in technical settings." },
        { kind: "expectation" as const, text: "Demonstrates full ownership and supports others through leadership." },
        { kind: "expectation" as const, text: "Progression: demonstrates technical leadership and ownership of systems." },
        { kind: "expectation" as const, text: "Progression: contributes to architecture and strategic decision-making." },
        { kind: "expectation" as const, text: "Progression: mentors engineers regularly and supports team development." },
        {
          kind: "expectation" as const,
          text: "Progression: aligns work with business goals and improves engineering outcomes.",
        },
      ],
    },
    {
      key: "eng_ic5",
      title: "Staff Engineer",
      track: "ic" as const,
      levelKey: "IC5",
      summary:
        "Provides high-level guidance and cross-team collaboration. Leads technical efforts and influences technical standards; identifies systemic issues and implements solutions. Ensures architectural consistency and strategic decision-making with organization-wide impact. Typical experience: 8+ years.",
      next: ["eng_ic6"],
      expectations: [
        { kind: "responsibility" as const, text: "Provide technical leadership across multiple teams." },
        { kind: "responsibility" as const, text: "Design and implement complex systems." },
        { kind: "responsibility" as const, text: "Mentor engineers and develop standards and policies." },
        {
          kind: "expectation" as const,
          text: "Leads by example; maintains a high-performance mindset and drives excellence.",
        },
        { kind: "expectation" as const, text: "Proactively identifies risks and ensures consistent delivery." },
        { kind: "expectation" as const, text: "Champions innovation in complex and ambiguous scenarios." },
        {
          kind: "expectation" as const,
          text: "Bridges technical discussions across teams and facilitates alignment.",
        },
        {
          kind: "expectation" as const,
          text: "Drives technical direction with a strong sense of accountability and influence.",
        },
        { kind: "expectation" as const, text: "Progression: leads initiatives with broad scope and long-term impact." },
        { kind: "expectation" as const, text: "Progression: drives cross-functional collaboration and alignment." },
        { kind: "expectation" as const, text: "Progression: coaches multiple teams and influences engineering practices." },
        { kind: "expectation" as const, text: "Progression: improves architecture and system scalability across teams." },
      ],
    },
    {
      key: "eng_ic6",
      title: "Principal Engineer",
      track: "ic" as const,
      levelKey: "IC6",
      summary:
        "Drives technical strategy and influences the entire organization. Solves complex, high-stakes, long-term issues; oversees architecture and best practices across the company. Aligns technical direction with business strategy; mentors engineers at all levels and shapes future leaders. Typical experience: 10+ years.",
      next: [],
      expectations: [
        { kind: "responsibility" as const, text: "Define and communicate technical vision." },
        { kind: "responsibility" as const, text: "Lead strategic technical development." },
        { kind: "responsibility" as const, text: "Represent company at industry events." },
        { kind: "responsibility" as const, text: "Mentor broadly across the organization." },
        { kind: "expectation" as const, text: "Operates at peak effectiveness; continually raises performance standards." },
        { kind: "expectation" as const, text: "Drives mission-critical outcomes and ensures long-term success." },
        { kind: "expectation" as const, text: "Invents and implements transformative solutions with broad impact." },
        { kind: "expectation" as const, text: "Aligns vision and execution across the organization." },
        {
          kind: "expectation" as const,
          text: "Takes ownership of strategic outcomes and nurtures engineering culture.",
        },
      ],
    },
    {
      key: "eng_l1",
      title: "Lead Software Engineer",
      track: "manager" as const,
      levelKey: "L1",
      summary:
        "Oversees technical project execution and team mentorship. Bridges communication between teams and management; guides task assignments and architecture decisions; ensures code quality and consistency. Typical experience: 5+ years.",
      next: ["eng_m1"],
      expectations: [
        { kind: "responsibility" as const, text: "Shift from IC to team leadership." },
        { kind: "responsibility" as const, text: "Guide engineers and lead backlog discussions." },
        {
          kind: "expectation" as const,
          text: "Guides team performance through consistent commitment to results.",
        },
        { kind: "expectation" as const, text: "Ensures delivery through hands-on support and strategic planning." },
        { kind: "expectation" as const, text: "Enables practical innovation through technical leadership." },
        { kind: "expectation" as const, text: "Connects individuals and teams through clear communication." },
        { kind: "expectation" as const, text: "Models full ownership and empowers the team to succeed." },
        { kind: "expectation" as const, text: "Progression: leads engineering execution and delivery." },
        { kind: "expectation" as const, text: "Progression: effectively mentors and develops engineering talent." },
        {
          kind: "expectation" as const,
          text: "Progression: aligns technical decisions with product and business needs.",
        },
        { kind: "expectation" as const, text: "Progression: builds trust and communication with stakeholders." },
      ],
    },
    {
      key: "eng_m1",
      title: "Engineering Manager",
      track: "manager" as const,
      levelKey: "M1",
      summary:
        "Manages a team, offering support and mentorship. Owns team productivity and performance; works with product and other stakeholders to define scope and timelines; conducts reviews and ensures standards. Typical experience: 6+ years.",
      next: ["eng_m2"],
      expectations: [
        { kind: "responsibility" as const, text: "Manage and mentor team." },
        { kind: "responsibility" as const, text: "Plan and schedule projects." },
        { kind: "responsibility" as const, text: "Conduct performance reviews and stakeholder communication." },
        { kind: "expectation" as const, text: "Enables high output through structured and motivated teams." },
        { kind: "expectation" as const, text: "Accountable for team goals and smooth execution." },
        { kind: "expectation" as const, text: "Encourages adaptive thinking and improvement." },
        { kind: "expectation" as const, text: "Ensures clarity across all layers of execution." },
        { kind: "expectation" as const, text: "Develops people and systems through proactive leadership." },
        { kind: "expectation" as const, text: "Progression: demonstrates success in team outcomes and delivery." },
        {
          kind: "expectation" as const,
          text: "Progression: develops a high-performing, collaborative team culture.",
        },
        {
          kind: "expectation" as const,
          text: "Progression: manages complex initiatives and communicates effectively across the org.",
        },
        { kind: "expectation" as const, text: "Progression: attracts, retains, and grows engineering talent." },
      ],
    },
    {
      key: "eng_m2",
      title: "Head of Engineering",
      track: "manager" as const,
      levelKey: "M2",
      summary:
        "Leads engineering department strategy and direction. Manages managers and ensures alignment with business needs; represents engineering at the executive level. Typical experience: 10+ years.",
      next: ["eng_m3"],
      expectations: [
        { kind: "responsibility" as const, text: "Define engineering strategy." },
        { kind: "responsibility" as const, text: "Manage and mentor engineering leaders." },
        { kind: "responsibility" as const, text: "Collaborate with cross-functional departments." },
        { kind: "responsibility" as const, text: "Lead recruitment and hiring." },
        { kind: "expectation" as const, text: "Sets department-wide excellence standards." },
        { kind: "expectation" as const, text: "Aligns engineering success with business impact." },
        { kind: "expectation" as const, text: "Initiates scalable, forward-thinking innovations." },
        { kind: "expectation" as const, text: "Acts as an executive voice for engineering." },
        { kind: "expectation" as const, text: "Leads strategy and growth with full accountability." },
        {
          kind: "expectation" as const,
          text: "Progression: shapes departmental strategy aligned with company goals.",
        },
        {
          kind: "expectation" as const,
          text: "Progression: demonstrates exceptional leadership across multiple teams.",
        },
        {
          kind: "expectation" as const,
          text: "Progression: advocates for engineering in executive-level decision-making.",
        },
        {
          kind: "expectation" as const,
          text: "Progression: builds scalable practices and high-performing engineering orgs.",
        },
      ],
    },
    {
      key: "eng_m3",
      title: "Chief Technical Officer (CTO)",
      track: "manager" as const,
      levelKey: "M3",
      summary:
        "Highest-ranking technical executive. Oversees all technical aspects and strategy; aligns technology with business goals. Typical experience: 15+ years.",
      next: [],
      expectations: [
        { kind: "responsibility" as const, text: "Develop and implement technology strategy and roadmap." },
        { kind: "responsibility" as const, text: "Lead technology innovation and partnerships." },
        { kind: "responsibility" as const, text: "Manage budget, risks, compliance, and talent acquisition." },
        { kind: "expectation" as const, text: "Maintains top-tier strategic output and vision." },
        { kind: "expectation" as const, text: "Ensures long-term stability and innovation alignment." },
        { kind: "expectation" as const, text: "Drives industry-defining technology direction." },
        { kind: "expectation" as const, text: "Inspires through clarity, influence, and vision." },
        {
          kind: "expectation" as const,
          text: "Leads the technical organization with excellence and integrity.",
        },
      ],
    },
  ] satisfies DefaultRole[],
};

export function competencyKeysForTrack(track: DefaultRole["track"]): string[] {
  return track === "manager"
    ? ["execution", "ownership", "collaboration", "impact", "people_leadership", "org_influence"]
    : ["execution", "technical_depth", "ownership", "collaboration", "impact", "growth_leadership"];
}
