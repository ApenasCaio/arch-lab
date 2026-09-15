import { Pedido } from '../src/domain/entities/Pedido';
import { ItemPedido } from '../src/domain/entities/ItemPedido';
import { Dinheiro } from '../src/domain/value_objects/Dinheiro';
import {
  PedidoSemItensException,
  TransicaoDeStatusInvalidaException,
} from '../src/domain/exceptions/DomainException';

/**
 * Testes unitários do DOMÍNIO puro — nenhum mock de banco ou HTTP é
 * necessário, pois a Entidade não depende de infraestrutura. Esta é a
 * principal vantagem prática de manter o domínio isolado.
 */
describe('Entidade Pedido', () => {
  const itemValido = () => new ItemPedido('produto-1', 2, Dinheiro.deReais(10));

  it('deve calcular o valor total somando os subtotais dos itens', () => {
    const pedido = Pedido.criar('cliente-1', [itemValido()]);
    expect(pedido.valorTotal.valorEmReais).toBe(20);
  });

  it('deve lançar PedidoSemItensException ao criar pedido sem itens', () => {
    expect(() => Pedido.criar('cliente-1', [])).toThrow(PedidoSemItensException);
  });

  it('deve permitir a transição de PENDENTE para PAGO', () => {
    const pedido = Pedido.criar('cliente-1', [itemValido()]);
    pedido.marcarComoPago();
    expect(pedido.status).toBe('PAGO');
  });

  it('não deve permitir cancelar um pedido já pago', () => {
    const pedido = Pedido.criar('cliente-1', [itemValido()]);
    pedido.marcarComoPago();
    expect(() => pedido.cancelar()).toThrow(TransicaoDeStatusInvalidaException);
  });
});
