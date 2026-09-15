import { PrismaClient } from '@prisma/client';
import { UnitOfWork } from '../../application/services/UnitOfWork';
import { PedidoRepositoryPrisma } from '../repositories/PedidoRepositoryPrisma';
import { PedidoRepository } from '../../domain/repositories/PedidoRepository';

/**
 * Implementação concreta da Unit of Work usando `prisma.$transaction`. Se o
 * callback `trabalho` lançar (por exemplo, uma DomainException vinda do caso
 * de uso), o Prisma executa ROLLBACK automaticamente e a exceção propaga
 * para o Controller.
 */
export class UnitOfWorkPrisma implements UnitOfWork {
  // Fora de uma transação ativa, expõe um repositório ligado ao client "raiz".
  readonly pedidos: PedidoRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.pedidos = new PedidoRepositoryPrisma(this.prisma);
  }

  async executar<T>(trabalho: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    console.log('[Infrastructure:UnitOfWork] BEGIN transação');
    try {
      const resultado = await this.prisma.$transaction(async (tx) => {
        const uowTransacional: UnitOfWork = {
          pedidos: new PedidoRepositoryPrisma(tx),
          executar: async (novoTrabalho) => novoTrabalho(uowTransacional),
        };
        return trabalho(uowTransacional);
      });
      console.log('[Infrastructure:UnitOfWork] COMMIT (transação confirmada)');
      return resultado;
    } catch (erro) {
      console.warn('[Infrastructure:UnitOfWork] ROLLBACK (transação desfeita):', (erro as Error).message);
      throw erro;
    }
  }
}
