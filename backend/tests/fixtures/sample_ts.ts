export interface User {
  id: number;
  name: string;
}

export type ID = string | number;

export function getUser(id: ID): User {
  return { id: 1, name: "x" };
}
