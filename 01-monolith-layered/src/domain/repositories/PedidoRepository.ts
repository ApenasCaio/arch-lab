import { Pedido } from '../entities/Pedido';

/**
 * Contrato de Repositório (Porta de saída do domínio).
 *
 * Esta é uma INTERFACE PURA: não importa Prisma, SQL ou qualquer detalhe de
 * infraestrutura. É o mecanismo de Inversão de Dependência (Dependency
 * Inversion Principle) — o domínio define o contrato, e é a camada de
 * infraestrutura (ver infrastructure/repositories/PedidoRepositoryPrisma.ts)
 * que o implementa. O domínio nunca aponta "para baixo" na pilha.
 */
export interface PedidoRepository {
  salvar(pedido: Pedido): Promise<void>;
  buscarPorId(id: string): Promise<Pedido | null>;
  listarTodos(): Promise<Pedido[]>;
}
