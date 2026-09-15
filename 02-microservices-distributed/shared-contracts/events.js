"use strict";
/**
 * Contratos de Eventos compartilhados pelo Barramento de Mensagens (Kafka).
 *
 * Este é o ÚNICO artefato de código compartilhado entre os microsserviços —
 * e mesmo assim, ele contém apenas TIPOS/FORMATOS de payload, nunca lógica
 * de negócio. Cada serviço é livre para copiar este arquivo para seu próprio
 * build (em um monorepo real, isto seria publicado como um pacote npm
 * privado versionado, ex: @acme/shared-contracts).
 *
 * Padrão de nomenclatura: eventos são fatos que JÁ ocorreram, por isso os
 * nomes estão no passado (Criado, Reservado, Aprovado, Falhou, Revertido).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIPOS_EVENTO = exports.TOPICOS = void 0;
exports.TOPICOS = {
    PEDIDOS: 'pedidos.eventos',
    ESTOQUE: 'estoque.eventos',
    PAGAMENTOS: 'pagamentos.eventos',
};
exports.TIPOS_EVENTO = {
    PEDIDO_CRIADO: 'PedidoCriadoEvent',
    ESTOQUE_RESERVADO: 'EstoqueReservadoEvent',
    PAGAMENTO_APROVADO: 'PagamentoAprovadoEvent',
    PAGAMENTO_FALHOU: 'PagamentoFalhouEvent',
    ESTOQUE_REVERTIDO: 'EstoqueRevertidoEvent',
};
//# sourceMappingURL=events.js.map