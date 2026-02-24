import {
  AssignmentStatus,
  EnrollmentRole,
  PolicyStatus,
  SeverityLevel,
  UserRole,
} from '@prisma/client';

import { prisma } from '../src/lib/db/client';

async function main() {
  const [student, instructor, admin] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'student@ntnu.no' },
      update: {
        name: 'Student User',
        role: UserRole.STUDENT,
        authSubject: 'local:student@ntnu.no',
      },
      create: {
        email: 'student@ntnu.no',
        name: 'Student User',
        role: UserRole.STUDENT,
        authSubject: 'local:student@ntnu.no',
      },
    }),
    prisma.user.upsert({
      where: { email: 'instructor@ntnu.no' },
      update: {
        name: 'Instructor User',
        role: UserRole.INSTRUCTOR,
        authSubject: 'local:instructor@ntnu.no',
      },
      create: {
        email: 'instructor@ntnu.no',
        name: 'Instructor User',
        role: UserRole.INSTRUCTOR,
        authSubject: 'local:instructor@ntnu.no',
      },
    }),
    prisma.user.upsert({
      where: { email: 'admin@ntnu.no' },
      update: {
        name: 'Admin User',
        role: UserRole.ADMIN,
        authSubject: 'local:admin@ntnu.no',
      },
      create: {
        email: 'admin@ntnu.no',
        name: 'Admin User',
        role: UserRole.ADMIN,
        authSubject: 'local:admin@ntnu.no',
      },
    }),
  ]);

  const [courseA, courseB] = await Promise.all([
    prisma.course.upsert({
      where: { courseCode: 'TDT4290' },
      update: {
        name: 'Customer Driven Project',
        institution: 'NTNU',
      },
      create: {
        courseCode: 'TDT4290',
        name: 'Customer Driven Project',
        institution: 'NTNU',
      },
    }),
    prisma.course.upsert({
      where: { courseCode: 'TDT4100' },
      update: {
        name: 'Object Oriented Programming',
        institution: 'NTNU',
      },
      create: {
        courseCode: 'TDT4100',
        name: 'Object Oriented Programming',
        institution: 'NTNU',
      },
    }),
  ]);

  const courseRuleSeed = [
    { courseId: courseA.id, nodeId: 'full-section-generation', isAllowed: false },
    { courseId: courseA.id, nodeId: 'full-solution-generation', isAllowed: false },
    { courseId: courseA.id, nodeId: 'partial-text-generation', isAllowed: true },
    { courseId: courseA.id, nodeId: 'partial-code-generation', isAllowed: true },
    { courseId: courseB.id, nodeId: 'full-section-generation', isAllowed: false },
    { courseId: courseB.id, nodeId: 'full-solution-generation', isAllowed: false },
    { courseId: courseB.id, nodeId: 'test-generation', isAllowed: true },
    { courseId: courseB.id, nodeId: 'debugging-support', isAllowed: true },
  ];

  for (const rule of courseRuleSeed) {
    await prisma.courseUsageRule.upsert({
      where: {
        courseId_nodeId: {
          courseId: rule.courseId,
          nodeId: rule.nodeId,
        },
      },
      update: {
        isAllowed: rule.isAllowed,
      },
      create: {
        courseId: rule.courseId,
        nodeId: rule.nodeId,
        isAllowed: rule.isAllowed,
      },
    });
  }

  await Promise.all([
    prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: student.id,
          courseId: courseA.id,
        },
      },
      update: { role: EnrollmentRole.STUDENT },
      create: {
        userId: student.id,
        courseId: courseA.id,
        role: EnrollmentRole.STUDENT,
      },
    }),
    prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: student.id,
          courseId: courseB.id,
        },
      },
      update: { role: EnrollmentRole.STUDENT },
      create: {
        userId: student.id,
        courseId: courseB.id,
        role: EnrollmentRole.STUDENT,
      },
    }),
    prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: instructor.id,
          courseId: courseA.id,
        },
      },
      update: { role: EnrollmentRole.INSTRUCTOR },
      create: {
        userId: instructor.id,
        courseId: courseA.id,
        role: EnrollmentRole.INSTRUCTOR,
      },
    }),
  ]);

  const assignments = [
    {
      courseId: courseA.id,
      title: 'Project Proposal',
      assignmentCode: 'TDT4290-PROPOSAL',
      description: 'Initial project proposal for customer review',
    },
    {
      courseId: courseA.id,
      title: 'Sprint Retrospective',
      assignmentCode: 'TDT4290-RETRO',
      description: 'Weekly sprint reflection',
    },
    {
      courseId: courseB.id,
      title: 'Design Patterns Exercise',
      assignmentCode: 'TDT4100-PATTERNS',
      description: 'Implement selected GoF patterns',
    },
    {
      courseId: courseB.id,
      title: 'Refactoring Report',
      assignmentCode: 'TDT4100-REFACTOR',
      description: 'Analyze and improve legacy code',
    },
  ];

  for (const assignment of assignments) {
    const existing = await prisma.assignment.findFirst({
      where: {
        courseId: assignment.courseId,
        title: assignment.title,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.assignment.create({
        data: {
          courseId: assignment.courseId,
          title: assignment.title,
          assignmentCode: assignment.assignmentCode,
          description: assignment.description,
          status: AssignmentStatus.ACTIVE,
        },
      });
      continue;
    }

    await prisma.assignment.update({
      where: { id: existing.id },
      data: {
        assignmentCode: assignment.assignmentCode,
        description: assignment.description,
        status: AssignmentStatus.ACTIVE,
      },
    });
  }

  const activePolicy = await prisma.policyVersion.upsert({
    where: { versionNumber: 'NTNU-Policy-v1.0' },
    update: {
      description: 'Initial active policy baseline',
      status: PolicyStatus.ACTIVE,
      publishedById: admin.id,
      publishedAt: new Date(),
      archivedAt: null,
    },
    create: {
      versionNumber: 'NTNU-Policy-v1.0',
      description: 'Initial active policy baseline',
      status: PolicyStatus.ACTIVE,
      publishedById: admin.id,
      publishedAt: new Date(),
    },
  });

  await prisma.policyVersion.updateMany({
    where: {
      id: { not: activePolicy.id },
      status: PolicyStatus.ACTIVE,
    },
    data: {
      status: PolicyStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });

  const seededRules = [
    {
      usageCategory: 'Grammar Fix',
      severityLevel: SeverityLevel.ALLOWED,
      ruleReference: 'NTNU-AI-1.1',
      description: 'Language polishing is allowed when content remains student-authored.',
      keywords: ['grammar', 'proofread', 'spelling', 'wording', 'rewrite sentence'],
    },
    {
      usageCategory: 'Code Debugging',
      severityLevel: SeverityLevel.MINOR,
      ruleReference: 'NTNU-AI-1.2',
      description: 'Debug assistance is allowed with clear student understanding.',
      keywords: ['debug', 'bug', 'traceback', 'fix error', 'stack trace'],
    },
    {
      usageCategory: 'Code Generation',
      severityLevel: SeverityLevel.MODERATE,
      ruleReference: 'NTNU-AI-1.3',
      description: 'Generated code must be disclosed and reviewed critically.',
      keywords: ['generate code', 'implement', 'scaffold', 'boilerplate', 'function'],
    },
    {
      usageCategory: 'Brainstorming',
      severityLevel: SeverityLevel.ALLOWED,
      ruleReference: 'NTNU-AI-1.4',
      description: 'Idea generation is allowed when final solution is student-produced.',
      keywords: ['brainstorm', 'ideas', 'outline', 'approach', 'alternatives'],
    },
    {
      usageCategory: 'Full Text Generation',
      severityLevel: SeverityLevel.FORBIDDEN,
      ruleReference: 'NTNU-AI-1.5',
      description: 'Submitting full AI-written text as own work is prohibited.',
      keywords: ['write full essay', 'complete report', 'entire answer', 'full text', 'submit for me'],
    },
  ];

  for (const rule of seededRules) {
    await prisma.policyRule.upsert({
      where: {
        policyVersionId_usageCategory: {
          policyVersionId: activePolicy.id,
          usageCategory: rule.usageCategory,
        },
      },
      update: {
        severityLevel: rule.severityLevel,
        ruleReference: rule.ruleReference,
        description: rule.description,
        keywords: rule.keywords,
      },
      create: {
        policyVersionId: activePolicy.id,
        usageCategory: rule.usageCategory,
        severityLevel: rule.severityLevel,
        ruleReference: rule.ruleReference,
        description: rule.description,
        keywords: rule.keywords,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        seeded: true,
        users: {
          studentId: student.id,
          instructorId: instructor.id,
          adminId: admin.id,
        },
        courses: {
          tdt4290: courseA.id,
          tdt4100: courseB.id,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
