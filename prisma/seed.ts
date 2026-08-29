import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed data placeholder
  // Example:
  // await prisma.user.create({
  //   data: {
  //     id: '2024001',
  //     role: 'STUDENT',
  //     name: '张三',
  //   },
  // });
  
  console.log('Seed placeholder - no data seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });