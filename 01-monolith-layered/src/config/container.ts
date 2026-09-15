import { PrismaClient } from '@prisma/client';
import { CriarPedidoUseCase } from '../application/use_cases/CriarPedidoUseCase';
import { UnitOfWorkPrisma } from '../infrastructure/database/UnitOfWorkPrisma';

/**
 * Contêiner de Injeção de Dependência (Composition Root).
 *
 * É o ÚNICO lugar do monolito que conhece TODAS as camadas simultaneamente
 * e "monta" o grafo de dependências: Infraestrutura concreta é injetada
 * em interfaces da Aplicação, que por sua vez é injetada no Controller.
 * Isso é o que viabiliza a Inversão de Dependência na prática — se um dia
 * trocarmos Prisma por outro ORM, apenas este arquivo muda.
 */
export function montarContainer() {
  const prisma = new PrismaClient();
  const unitOfWork = new UnitOfWorkPrisma(prisma);
  const criarPedidoUseCase = new CriarPedidoUseCase(unitOfWork);

  return { prisma, unitOfWork, criarPedidoUseCase };
}
