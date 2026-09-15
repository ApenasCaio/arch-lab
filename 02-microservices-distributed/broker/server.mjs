#!/usr/bin/env node
/**
 * Broker de Mensagens — substituto didático do Kafka/RabbitMQ.
 *
 * Este projeto originalmente usava Kafka de verdade, mas isso exigia Docker
 * (imagem do broker, Zookeeper/KRaft, etc.). Para que a demonstração rode
 * com ZERO dependências externas — só Node.js — implementamos aqui o
 * subconjunto de semântica de um barramento de mensagens que os
 * microsserviços realmente precisam:
 *
 *   - Tópicos nomeados, cada um com um log de mensagens que cresce por
 *     APPEND (nunca edita/remove uma mensagem já publicada).
 *   - Cada mensagem recebe um `offset` sequencial dentro do seu tópico.
 *   - Consumidores fazem "long polling": pedem mensagens a partir de um
 *     offset e o servidor SEGURA a resposta até haver uma mensagem nova
 *     (ou até um timeout), em vez de o cliente ficar batendo a cada Xms.
 *
 * Isso reproduz o modelo PULL do Kafka (o consumidor pergunta "o que veio
 * depois do offset N?") o suficiente para ensinar Event-Driven Architecture,
 * Sagas e Ações Compensatórias — sem precisar de infraestrutura externa.
 */
import http from 'node:http';

const PORTA = process.env.BROKER_PORT ?? 4500;

/** @type {Map<string, { mensagens: Array<{offset:number, chave:string, valor:string, publicadoEm:string}>, aguardando: Set<Function> }>} */
const topicos = new Map();

function obterTopico(nome) {
  if (!topicos.has(nome)) {
    topicos.set(nome, { mensagens: [], aguardando: new Set() });
  }
  return topicos.get(nome);
}

function publicar(nomeTopico, chave, valor) {
  const topico = obterTopico(nomeTopico);
  const mensagem = {
    offset: topico.mensagens.length,
    chave: chave ?? null,
    valor,
    publicadoEm: new Date().toISOString(),
  };
  topico.mensagens.push(mensagem);

  // Acorda imediatamente quem estava em long-poll esperando por esta mensagem.
  for (const resolver of topico.aguardando) resolver();
  topico.aguardando.clear();

  return mensagem;
}

function consumirDesde(nomeTopico, desde) {
  const topico = obterTopico(nomeTopico);
  return topico.mensagens.slice(desde);
}

/** Long-poll: resolve assim que houver mensagem nova, ou após `timeoutMs`. */
function aguardarNovaMensagem(nomeTopico, desde, timeoutMs) {
  const topico = obterTopico(nomeTopico);
  const jaDisponiveis = consumirDesde(nomeTopico, desde);
  if (jaDisponiveis.length > 0) return Promise.resolve(jaDisponiveis);

  return new Promise((resolve) => {
    const finalizar = () => {
      clearTimeout(temporizador);
      topico.aguardando.delete(resolver);
      resolve(consumirDesde(nomeTopico, desde));
    };
    const resolver = finalizar;
    const temporizador = setTimeout(finalizar, timeoutMs);
    topico.aguardando.add(resolver);
  });
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (chunk) => (dados += chunk));
    req.on('end', () => resolve(dados));
    req.on('error', reject);
  });
}

function responderJSON(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const partes = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return responderPaginaStatus(res);
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      const resumo = {};
      for (const [nome, topico] of topicos) {
        resumo[nome] = {
          totalMensagens: topico.mensagens.length,
          ultimaMensagem: topico.mensagens.at(-1) ?? null,
        };
      }
      return responderJSON(res, 200, resumo);
    }

    if (partes[0] === 'topicos' && partes[1]) {
      const nomeTopico = decodeURIComponent(partes[1]);

      if (req.method === 'POST') {
        const corpo = JSON.parse((await lerCorpo(req)) || '{}');
        const mensagem = publicar(nomeTopico, corpo.chave, corpo.valor);
        return responderJSON(res, 201, { offset: mensagem.offset });
      }

      if (req.method === 'GET') {
        const desde = Number(url.searchParams.get('desde') ?? '0');
        const timeoutMs = Math.min(Number(url.searchParams.get('timeoutMs') ?? '20000'), 30000);
        const mensagens = await aguardarNovaMensagem(nomeTopico, desde, timeoutMs);
        return responderJSON(res, 200, { mensagens });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Não encontrado');
  } catch (erro) {
    responderJSON(res, 500, { erro: erro.message });
  }
});

function responderPaginaStatus(res) {
  const linhas = [...topicos.entries()]
    .map(([nome, t]) => `<li><strong>${nome}</strong> — ${t.mensagens.length} mensagem(ns)</li>`)
    .join('');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Broker (substituto do Kafka)</title>
<style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#0f1115;color:#e6e9ef;padding:32px}
a{color:#4f8cff}</style></head>
<body>
<h1>Broker de Mensagens</h1>
<p>Substituto didático do Kafka — sem Docker, sem Zookeeper, só Node.js.</p>
<p>Veja <a href="/status">/status</a> para o JSON com a contagem de mensagens por tópico.</p>
<ul>${linhas || '<li>nenhum tópico ainda</li>'}</ul>
</body></html>`);
}

servidor.listen(PORTA, () => {
  console.log(`[broker] pronto em http://localhost:${PORTA}`);
});
