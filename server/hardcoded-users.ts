// Hardcoded test users mapped from dashboardMapping.ts
// Password for all users is 'test123' (hashed with bcrypt)
// Hash: $2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu
// Role structure: ADMIN, EMPLOYEE, OWNER

export interface HardcodedUser {
  id: number;
  username: string;
  password: string;
  role: string;
}

export const HARDCODED_USERS = new Map<string, HardcodedUser>([
  [
    'epoch',
    {
      id: 1,
      username: 'epoch',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'glennj',
    {
      id: 2,
      username: 'glennj',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'tasham',
    {
      id: 3,
      username: 'tasham',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'ADMIN',
    },
  ],
  [
    'staciw',
    {
      id: 4,
      username: 'staciw',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'agrace',
    {
      id: 5,
      username: 'agrace',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tims',
    {
      id: 6,
      username: 'tims',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'angiet',
    {
      id: 7,
      username: 'angiet',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'blaket',
    {
      id: 8,
      username: 'blaket',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'bradw',
    {
      id: 9,
      username: 'bradw',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'darleneb',
    {
      id: 10,
      username: 'darleneb',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'faleeshah',
    {
      id: 11,
      username: 'faleeshah',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'halls',
    {
      id: 12,
      username: 'halls',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'hunta',
    {
      id: 13,
      username: 'hunta',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'jens',
    {
      id: 14,
      username: 'jens',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'joeyb',
    {
      id: 15,
      username: 'joeyb',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'johnl',
    {
      id: 16,
      username: 'johnl',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'lauriet',
    {
      id: 17,
      username: 'lauriet',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tandyd',
    {
      id: 18,
      username: 'tandyd',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
  [
    'tandym',
    {
      id: 19,
      username: 'tandym',
      password: '$2b$10$eqwAR9UqwOGL4dOWvYQUzOsmZIqDSAenu7FM7P1Ba5OB6mS71pMnu',
      role: 'EMPLOYEE',
    },
  ],
]);
