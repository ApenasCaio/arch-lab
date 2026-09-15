import { z } from 'zod';

/**
 * Valida apenas FORMATO (tipos, obrigatoriedade, faixas simples) — regras de
 * NEGÓCIO (ex: "valor total não pode ser negativo") são responsabilidade do
 * Domínio. Separar essas duas responsabilidades permite que o domínio seja
 * reutilizado por qualquer entrada (HTTP, CLI, mensageria) sem duplicar validação.
 */
export const criarPedidoSchema = z.object({
  clienteId: z.string().min(1, 'clienteId é obrigatório'),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1),
        quantidade: z.number().int().positive(),
        precoUnitario: z.number().nonnegative(),
      }),
    )
    .min(1, 'itens deve conter ao menos um elemento'),
});

export type CriarPedidoRequestBody = z.infer<typeof criarPedidoSchema>;
