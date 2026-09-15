#!/usr/bin/env node
/**
 * Central de Arquiteturas — versão web, 100% sem Docker.
 *
 * Um servidor HTTP mínimo (sem dependências externas) que expõe um painel
 * visual no navegador para iniciar/parar o Monolito e/ou os Microsserviços.
 * Cada "arquitetura" é um conjunto de processos Node comuns (`npm run dev`
 * em cada pastinha) — nada de containers, imagens ou daemons externos.
 * Isso elimina de vez a classe de problema "Docker Desktop não está
 * pronto"/"imagem não existe mais no Hub" que motivou esta reescrita.
 *
 * Este arquivo é o único lugar do repositório que sabe orquestrar os
 * processos; nenhuma regra de negócio mora aqui.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(__dirname);
const PORTA = process.env.DASHBOARD_PORT ?? 4000;
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function caminho(...partes) {
  return path.join(RAIZ, ...partes);
}

const SERVICOS = {
  broker: {
    label: 'Broker (substituto do Kafka)',
    cwd: caminho('02-microservices-distributed', 'broker'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { BROKER_PORT: '4500' },
    preparar: [],
    porta: 4500,
  },
  'ms-orders': {
    label: 'ms-orders',
    cwd: caminho('02-microservices-distributed', 'ms-orders'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { DATABASE_URL: 'file:./data/orders.db', BROKER_URL: 'http://localhost:4500', PORT: '3001' },
    preparar: [
      [NPX_CMD, ['prisma', 'generate']],
      [NPX_CMD, ['prisma', 'db', 'push', '--accept-data-loss']],
    ],
    porta: 3001,
  },
  'ms-inventory': {
    label: 'ms-inventory',
    cwd: caminho('02-microservices-distributed', 'ms-inventory'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { BROKER_URL: 'http://localhost:4500' },
    preparar: [],
    porta: null, // não expõe HTTP, é 100% orientado a eventos
  },
  'ms-payments': {
    label: 'ms-payments',
    cwd: caminho('02-microservices-distributed', 'ms-payments'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { BROKER_URL: 'http://localhost:4500', SUFIXO_CLIENTE_FALHA: '-falha', SUFIXO_CLIENTE_SUCESSO: '-sucesso', TAXA_FALHA_ALEATORIA: '0.2' },
    preparar: [],
    porta: null,
  },
  'api-gateway': {
    label: 'API Gateway',
    cwd: caminho('02-microservices-distributed', 'api-gateway'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { MS_ORDERS_URL: 'http://localhost:3001', PORT: '8090' },
    preparar: [],
    porta: 8090,
  },
  monolith: {
    label: 'Monolito em 5 Camadas',
    cwd: caminho('01-monolith-layered'),
    cmd: [NPM_CMD, ['run', 'dev']],
    env: { DATABASE_URL: 'file:./data/monolith.db', PORT: '3000' },
    preparar: [
      [NPX_CMD, ['prisma', 'generate']],
      [NPX_CMD, ['prisma', 'db', 'push', '--accept-data-loss']],
    ],
    porta: 3000,
  },
};

const ARQUITETURAS = {
  monolith: { nome: 'Monolito em 5 Camadas', url: 'http://localhost:3000', servicos: ['monolith'] },
  microservices: {
    nome: 'Microsserviços Distribuídos',
    url: 'http://localhost:8090',
    servicos: ['broker', 'ms-orders', 'ms-inventory', 'ms-payments', 'api-gateway'],
  },
};

const MAX_LINHAS_BUFFER = 400;

for (const servico of Object.values(SERVICOS)) {
  servico.processo = null;
  servico.estado = 'parado'; // parado | preparando | running | erro
  servico.paradaIntencional = false;
  servico.bufferLogs = [];
  servico.emissor = new EventEmitter();
  servico.emissor.setMaxListeners(50);
}

function registrarLinha(nomeServico, texto) {
  const servico = SERVICOS[nomeServico];
  for (const linhaBruta of texto.split('\n')) {
    if (!linhaBruta.trim()) continue;
    const linha = linhaBruta.replace(/\r$/, '');
    // Cada serviço já rotula suas próprias mensagens (ex: "[ms-orders:Saga] ...");
    // só adicionamos um prefixo aqui para a saída "crua" de comandos de preparo
    // (npm install, prisma generate) que não se identifica sozinha.
    const linhaFinal = linha.startsWith('[') ? linha : `[${nomeServico}] ${linha}`;
    servico.bufferLogs.push(linhaFinal);
    if (servico.bufferLogs.length > MAX_LINHAS_BUFFER) servico.bufferLogs.shift();
    servico.emissor.emit('linha', linhaFinal);
  }
}

/** Roda um comando "de preparação" (npm install, prisma generate, ...) até o fim. */
function rodarComandoPreparo(nomeServico, comando, args) {
  const servico = SERVICOS[nomeServico];
  return new Promise((resolve) => {
    const processo = spawn(comando, args, {
      cwd: servico.cwd,
      env: { ...process.env, ...servico.env },
      shell: true,
    });
    processo.stdout.on('data', (d) => registrarLinha(nomeServico, d.toString()));
    processo.stderr.on('data', (d) => registrarLinha(nomeServico, d.toString()));
    processo.on('close', (codigo) => resolve(codigo === 0));
    processo.on('error', (erro) => {
      registrarLinha(nomeServico, `(falha ao executar ${comando}: ${erro.message})`);
      resolve(false);
    });
  });
}

/** No Windows, matar só o processo "pai" deixa órfãos (npm -> node -> ts-node-dev filho). */
function matarProcesso(processo) {
  if (!processo || processo.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(processo.pid), '/T', '/F'], { shell: true });
  } else {
    processo.kill('SIGTERM');
  }
}

/**
 * Rede de segurança: o `ts-node-dev` usado em `npm run dev` tem um recurso de
 * "respawn" que recria o processo do app como um FILHO NOVO a cada mudança de
 * arquivo — no Windows, esse filho pode ficar com um `ParentProcessId` que já
 * não corresponde mais ao processo que rastreamos, então `taskkill /T` (que
 * segue a árvore de processos) às vezes não o alcança, deixando a porta presa
 * mesmo após "Parar". Como sabemos em qual porta cada serviço deveria estar
 * escutando, fechamos o cerco: depois do `taskkill`, também derrubamos
 * diretamente qualquer processo que ainda esteja ouvindo naquela porta.
 */
function liberarPorta(porta) {
  if (!porta || process.platform !== 'win32') return;
  const script =
    `Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue | ` +
    `Select-Object -ExpandProperty OwningProcess -Unique | ` +
    `ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
  spawn('powershell', ['-NoProfile', '-Command', script], { shell: true });
}

async function iniciarServico(nomeServico) {
  const servico = SERVICOS[nomeServico];
  if (servico.estado === 'running' || servico.estado === 'preparando') return;

  servico.estado = 'preparando';
  registrarLinha(nomeServico, '--- preparando ---');
  liberarPorta(servico.porta); // limpa qualquer processo travado de uma execução anterior

  if (!fs.existsSync(path.join(servico.cwd, 'node_modules'))) {
    registrarLinha(nomeServico, 'node_modules não encontrado, rodando "npm install" (só na primeira vez)...');
    const instalou = await rodarComandoPreparo(nomeServico, NPM_CMD, ['install']);
    if (!instalou) {
      servico.estado = 'erro';
      registrarLinha(nomeServico, 'FALHA no "npm install" — veja os logs acima.');
      return;
    }
  }

  for (const [cmd, args] of servico.preparar) {
    const ok = await rodarComandoPreparo(nomeServico, cmd, args);
    if (!ok) {
      servico.estado = 'erro';
      registrarLinha(nomeServico, `FALHA ao rodar "${cmd} ${args.join(' ')}" — veja os logs acima.`);
      return;
    }
  }

  registrarLinha(nomeServico, '--- iniciando processo ---');
  servico.paradaIntencional = false;
  const [cmd, args] = servico.cmd;
  const processo = spawn(cmd, args, {
    cwd: servico.cwd,
    env: { ...process.env, ...servico.env },
    shell: true,
  });
  servico.processo = processo;
  servico.estado = 'running';

  processo.stdout.on('data', (d) => registrarLinha(nomeServico, d.toString()));
  processo.stderr.on('data', (d) => registrarLinha(nomeServico, d.toString()));
  processo.on('exit', (codigo) => {
    servico.processo = null;
    servico.estado = servico.paradaIntencional ? 'parado' : 'erro';
    registrarLinha(nomeServico, `--- processo encerrado (código ${codigo}) ---`);
  });
  processo.on('error', (erro) => {
    servico.estado = 'erro';
    registrarLinha(nomeServico, `(falha ao iniciar processo: ${erro.message})`);
  });
}

function pararServico(nomeServico) {
  const servico = SERVICOS[nomeServico];
  servico.paradaIntencional = true;
  matarProcesso(servico.processo);
  liberarPorta(servico.porta);
  servico.estado = 'parado';
}

async function iniciarArquitetura(chave) {
  for (const nomeServico of ARQUITETURAS[chave].servicos) {
    await iniciarServico(nomeServico);
  }
}

function pararArquitetura(chave) {
  for (const nomeServico of ARQUITETURAS[chave].servicos) {
    pararServico(nomeServico);
  }
}

function statusArquitetura(chave) {
  return ARQUITETURAS[chave].servicos.map((nomeServico) => ({
    servico: nomeServico,
    estado: SERVICOS[nomeServico].estado,
  }));
}

// Dispara um pedido real contra o serviço em execução para alimentar as
// animações do painel com dados reais. O navegador não pode chamar
// :3000/:8090 diretamente por causa de CORS entre origens diferentes,
// então o dashboard faz o proxy.
async function simularPedido(alvo) {
  const sufixo = Math.random().toString(36).slice(2, 6);
  const payloads = {
    monolith: {
      url: 'http://localhost:3000/pedidos',
      corpo: { clienteId: `demo-${sufixo}`, itens: [{ produtoId: 'produto-demo', quantidade: 2, precoUnitario: 49.9 }] },
    },
    'monolith-erro': {
      // quantidade negativa viola `z.number().int().positive()` do schema
      // Zod — o payload é rejeitado ainda na camada de Apresentação (400),
      // sem nunca alcançar o Domínio. É o caso de erro real e reproduzível
      // deste endpoint: o schema cobre as mesmas invariantes do Domínio, então
      // uma violação de regra de negócio (ex.: total negativo) não é alcançável
      // via HTTP — só a validação sintática é.
      url: 'http://localhost:3000/pedidos',
      corpo: { clienteId: `demo-${sufixo}`, itens: [{ produtoId: 'produto-demo', quantidade: -1, precoUnitario: 49.9 }] },
    },
    sucesso: {
      // Sufixo "-sucesso" força aprovação determinística em ProcessadorPagamento —
      // sem isso, a falha ESPONTÂNEA de ~20% podia fazer até o botão de
      // "sucesso garantido" terminar em CANCELADO de vez em quando.
      url: 'http://localhost:8090/pedidos',
      corpo: { clienteId: `demo-${sufixo}-sucesso`, itens: [{ produtoId: 'produto-demo', quantidade: 1, precoUnitario: 99.9 }] },
    },
    falha: {
      url: 'http://localhost:8090/pedidos',
      corpo: { clienteId: `demo-${sufixo}-falha`, itens: [{ produtoId: 'produto-demo', quantidade: 1, precoUnitario: 150 }] },
    },
  };
  const alvoConfig = payloads[alvo];
  if (!alvoConfig) return { alcancado: false, erro: 'alvo de simulação desconhecido' };

  // `alcancado` = o dashboard conseguiu falar com o serviço-alvo (nível de
  // rede/proxy). É INDEPENDENTE do status HTTP retornado por ele: um 400
  // vindo do monolito (ex.: payload inválido) é uma simulação bem-sucedida
  // — o proxy alcançou o serviço e recebeu a resposta esperada. Antes disso,
  // qualquer resposta não-2xx do alvo (inclusive um 400 DE PROPÓSITO, como o
  // caso "monolith-erro") fazia este endpoint devolver 502 ao navegador,
  // como se fosse uma falha de rede — o que disparava o toast genérico de
  // erro no painel mesmo quando a simulação funcionou exatamente como
  // esperado.
  try {
    const resp = await fetch(alvoConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alvoConfig.corpo),
    });
    const dados = await resp.json();
    return { alcancado: true, status: resp.status, dados };
  } catch (erro) {
    return { alcancado: false, erro: `não foi possível contatar ${alvoConfig.url}: ${erro.message}` };
  }
}

async function iniciarTudoAutomaticamente() {
  if (process.env.DASHBOARD_AUTOSTART === 'false') {
    console.log('[dashboard] auto-start desabilitado. Use os botões do painel para iniciar.');
    return;
  }
  console.log('[dashboard] iniciando as duas arquiteturas automaticamente (sem Docker, só Node)...');
  await iniciarArquitetura('monolith');
  await iniciarArquitetura('microservices');
  console.log(`[dashboard] pronto! Acompanhe o status/logs em http://localhost:${PORTA}`);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const resposta = {};
      for (const chave of Object.keys(ARQUITETURAS)) resposta[chave] = statusArquitetura(chave);
      return responderJSON(res, 200, resposta);
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/start/')) {
      const chave = url.pathname.split('/').pop();
      if (!ARQUITETURAS[chave]) return responderJSON(res, 404, { erro: 'arquitetura desconhecida' });
      iniciarArquitetura(chave); // não aguarda: builds/instalação podem demorar, o status é consultado via polling
      return responderJSON(res, 202, { ok: true, mensagem: 'iniciando em segundo plano' });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/stop/')) {
      const chave = url.pathname.split('/').pop();
      if (!ARQUITETURAS[chave]) return responderJSON(res, 404, { erro: 'arquitetura desconhecida' });
      pararArquitetura(chave);
      return responderJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/down') {
      for (const chave of Object.keys(ARQUITETURAS)) pararArquitetura(chave);
      return responderJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/simular/')) {
      const alvo = url.pathname.split('/').pop(); // 'monolith' | 'sucesso' | 'falha'
      const resultado = await simularPedido(alvo);
      return responderJSON(res, resultado.alcancado ? 200 : 502, resultado);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/logs/')) {
      const chave = url.pathname.split('/').pop();
      const servicosAlvo = ARQUITETURAS[chave]
        ? ARQUITETURAS[chave].servicos
        : Object.keys(SERVICOS); // 'all'

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const enviar = (linha) => res.write(`data: ${linha}\n\n`);

      // `somenteNovas=1` pula o replay do histórico — usado pelo grafo, que
      // mantém a conexão SSE aberta o tempo todo (e pode reconectar sozinho
      // várias vezes antes de qualquer coisa estar rodando). Sem isso, cada
      // reconexão replayaria até 100 linhas antigas e disparava de novo
      // animações de eventos que já aconteceram há muito tempo.
      if (url.searchParams.get('somenteNovas') !== '1') {
        const historico = servicosAlvo
          .flatMap((s) => SERVICOS[s].bufferLogs)
          .slice(-100);
        for (const linha of historico) enviar(linha);
        if (historico.length === 0) enviar('(sem logs ainda — clique em "Iniciar" se ainda não iniciou esta arquitetura)');
      }

      const ouvintes = servicosAlvo.map((s) => {
        const ouvinte = (linha) => enviar(linha);
        SERVICOS[s].emissor.on('linha', ouvinte);
        return { servico: s, ouvinte };
      });

      req.on('close', () => {
        for (const { servico, ouvinte } of ouvintes) SERVICOS[servico].emissor.off('linha', ouvinte);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Não encontrado');
  } catch (erro) {
    responderJSON(res, 500, { erro: erro.message });
  }
});

function responderJSON(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(
      `\n[dashboard] A porta ${PORTA} já está em uso — provavelmente um \`npm start\` anterior ainda está ` +
        `rodando em outro terminal (ou travou). Feche esse processo, ou rode com outra porta: ` +
        `DASHBOARD_PORT=4001 npm start\n`,
    );
  } else {
    console.error('[dashboard] falha ao iniciar o servidor HTTP:', erro.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[dashboard] encerrando todos os processos filhos...');
  for (const nomeServico of Object.keys(SERVICOS)) pararServico(nomeServico);
  process.exit(0);
});

servidor.listen(PORTA, () => {
  console.log(`\n  Central de Arquiteturas disponível em: http://localhost:${PORTA}\n`);
  iniciarTudoAutomaticamente().catch((erro) => console.error('[dashboard] erro inesperado no auto-start:', erro));
});
