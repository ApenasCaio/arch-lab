import { randomUUID } from 'crypto';
import { Dinheiro } from '../value_objects/Dinheiro';
import { StatusPedido, transicaoEhValida } from '../value_objects/StatusPedido';
import { ItemPedido } from './ItemPedido';
import {
  PedidoSemItensException,
  TransicaoDeStatusInvalidaException,
  ValorTotalInvalidoException,
} from '../exceptions/DomainException';

/**
 * Aggregate Root do domínio de vendas. Não conhece HTTP, ORM ou banco de
 * dados — isso é o que torna o domínio testável isoladamente e independente
 * de infraestrutura (a infraestrutura depende do domínio, nunca o contrário).
 */
export class Pedido {
  private constructor(
    readonly id: string,
    readonly clienteId: string,
    private itens: ItemPedido[],
    private _status: StatusPedido,
  ) {
    this.validarInvariantes();
  }

  /** Fábrica usada para CRIAR um novo pedido (garante as invariantes de criação). */
  static criar(clienteId: string, itens: ItemPedido[]): Pedido {
    if (itens.length === 0) {
      throw new PedidoSemItensException();
    }
    return new Pedido(randomUUID(), clienteId, itens, StatusPedido.PENDENTE);
  }

  /** Fábrica usada para RECONSTITUIR um pedido a partir de dados persistidos. */
  static reconstituir(
    id: string,
    clienteId: string,
    itens: ItemPedido[],
    status: StatusPedido,
  ): Pedido {
    return new Pedido(id, clienteId, itens, status);
  }

  get status(): StatusPedido {
    return this._status;
  }

  get listaItens(): readonly ItemPedido[] {
    return this.itens;
  }

  get valorTotal(): Dinheiro {
    return this.itens.reduce((acc, item) => acc.somar(item.subtotal), Dinheiro.zero());
  }

  marcarComoPago(): void {
    this.transicionarPara(StatusPedido.PAGO);
  }

  cancelar(): void {
    this.transicionarPara(StatusPedido.CANCELADO);
  }

  private transicionarPara(destino: StatusPedido): void {
    if (!transicaoEhValida(this._status, destino)) {
      throw new TransicaoDeStatusInvalidaException(this._status, destino);
    }
    this._status = destino;
  }

  /**
   * Invariantes de negócio: condições que DEVEM ser verdadeiras em qualquer
   * estado válido do agregado. São verificadas em toda construção/reconstituição.
   */
  private validarInvariantes(): void {
    if (this.valorTotal.ehNegativo()) {
      throw new ValorTotalInvalidoException(this.valorTotal.valorEmReais);
    }
  }
}
