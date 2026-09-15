import { PedidoRepository } from '../../domain/repositories/PedidoRepository';

/**
 * Porta de saída "Unit of Work".
 *
 * Abstrai a noção de "uma única transação ACID local". A camada de aplicação
 * depende apenas desta interface — quem decide COMMIT/ROLLBACK e qual
 * tecnologia de banco está por trás é responsabilidade exclusiva da
 * infraestrutura (ver infrastructure/database/UnitOfWorkPrisma.ts).
 */
export interface UnitOfWork {
  readonly pedidos: PedidoRepository;

  /**
   * Executa `trabalho` dentro de uma única transação. Se `trabalho` lançar
   * qualquer exceção, a transação inteira sofre ROLLBACK; caso contrário,
   * ocorre COMMIT automático ao final.
   */
  executar<T>(trabalho: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}
