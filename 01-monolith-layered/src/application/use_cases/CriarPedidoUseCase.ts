import { ItemPedido } from '../../domain/entities/ItemPedido';
import { Pedido } from '../../domain/entities/Pedido';
import { Dinheiro } from '../../domain/value_objects/Dinheiro';
import { UnitOfWork } from '../services/UnitOfWork';
import { CriarPedidoInputDTO, PedidoOutputDTO } from './CriarPedidoDTO';

/**
 * Este caso de uso apenas orquestra: não contém regra de negócio (isso
 * pertence ao Domínio) nem detalhes de SQL/HTTP (isso pertence à
 * Infraestrutura/Apresentação).
 */
export class CriarPedidoUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async executar(input: CriarPedidoInputDTO): Promise<PedidoOutputDTO> {
    console.log(`[Application:UseCase] orquestrando criação do pedido (cliente ${input.clienteId}, ${input.itens.length} item(ns))`);

    const itens = input.itens.map(
      (item) => new ItemPedido(item.produtoId, item.quantidade, Dinheiro.deReais(item.precoUnitario)),
    );

    const pedido = Pedido.criar(input.clienteId, itens);
    console.log(`[Domain] Pedido.criar() validou as invariantes -> pedido válido (id=${pedido.id}, total=${pedido.valorTotal.valorEmReais})`);

    await this.unitOfWork.executar(async (uow) => {
      await uow.pedidos.salvar(pedido);
    });

    return this.paraDTO(pedido);
  }

  private paraDTO(pedido: Pedido): PedidoOutputDTO {
    return {
      id: pedido.id,
      clienteId: pedido.clienteId,
      status: pedido.status,
      valorTotal: pedido.valorTotal.valorEmReais,
      itens: pedido.listaItens.map((item) => ({
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario.valorEmReais,
      })),
    };
  }
}
