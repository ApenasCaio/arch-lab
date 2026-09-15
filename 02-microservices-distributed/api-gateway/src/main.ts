import express from 'express';

/**
 * API Gateway — único ponto de entrada HTTP do ecossistema de
 * microsserviços, visível ao cliente externo. Sua única responsabilidade
 * aqui é rotear a requisição para o serviço dono do recurso (ms-orders);
 * ele NÃO conhece Kafka, Sagas ou bancos de dados — isso é encapsulado
 * dentro de cada microsserviço.
 */
const app = express();
app.use(express.json());

const URL_MS_ORDERS = process.env.MS_ORDERS_URL ?? 'http://localhost:3001';

app.post('/pedidos', async (req, res) => {
  console.log('[api-gateway] POST /pedidos -> encaminhando para ms-orders');
  try {
    const resposta = await fetch(`${URL_MS_ORDERS}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const corpo = await resposta.json();
    return res.status(resposta.status).json(corpo);
  } catch (erro) {
    console.error('[api-gateway] falha ao encaminhar para ms-orders:', erro);
    return res.status(502).json({ erro: 'ms-orders indisponível' });
  }
});

app.get('/pedidos/:id', async (req, res) => {
  const resposta = await fetch(`${URL_MS_ORDERS}/pedidos/${req.params.id}`);
  const corpo = await resposta.json();
  return res.status(resposta.status).json(corpo);
});

const PORTA = process.env.PORT ?? 8090;
app.listen(PORTA, () => console.log(`[api-gateway] escutando na porta ${PORTA}`));
