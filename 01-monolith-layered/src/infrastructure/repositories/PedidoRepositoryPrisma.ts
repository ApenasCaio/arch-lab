import { Prisma, PrismaClient } from '@prisma/client';
import { Pedido } from '../../domain/entities/Pedido';
import { ItemPedido } from '../../domain/entities/ItemPedido';
import { Dinheiro } from '../../domain/value_objects/Dinheiro';
import { StatusPedido } from '../../domain/value_objects/StatusPedido';
import { PedidoRepository } from '../../domain/repositories/PedidoRepository';

/**
 * Implementa o contrato `PedidoRepository` definido no Domínio usando Prisma
 * ORM. Recebe um `Prisma.TransactionClient` para poder participar da
 * transação aberta pela Unit of Work.
 */
export class PedidoRepositoryPrisma implements PedidoRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  async salvar(pedido: Pedido): Promise<void> {
    console.log(`[Infrastructure:Repository] traduzindo entidade Pedido -> tabela 'pedidos' (id=${pedido.id})`);
    await this.db.pedidoModel.upsert({
      where: { id: pedido.id },
      create: {
        id: pedido.id,
        clienteId: pedido.clienteId,
        status: pedido.status,
        itens: {
          create: pedido.listaItens.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            precoUnitarioCent: Math.round(item.precoUnitario.valorEmReais * 100),
          })),
        },
      },
      update: {
        status: pedido.status,
      },
    });
  }

  async buscarPorId(id: string): Promise<Pedido | null> {
    const registro = await this.db.pedidoModel.findUnique({
      where: { id },
      include: { itens: true },
    });
    if (!registro) return null;
    return this.paraEntidade(registro);
  }

  async listarTodos(): Promise<Pedido[]> {
    const registros = await this.db.pedidoModel.findMany({ include: { itens: true } });
    return registros.map((registro) => this.paraEntidade(registro));
  }

  private paraEntidade(registro: {
    id: string;
    clienteId: string;
    status: string;
    itens: { produtoId: string; quantidade: number; precoUnitarioCent: number }[];
  }): Pedido {
    const itens = registro.itens.map(
      (item) =>
        new ItemPedido(item.produtoId, item.quantidade, Dinheiro.deReais(item.precoUnitarioCent / 100)),
    );
    return Pedido.reconstituir(
      registro.id,
      registro.clienteId,
      itens,
      registro.status as StatusPedido,
    );
  }
}
