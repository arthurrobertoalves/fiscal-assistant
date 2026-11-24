// Dados públicos de um usuário. O hash de senha pertence à infraestrutura
// e nunca entra no domínio exposto à API.
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
