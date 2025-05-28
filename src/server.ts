import http from 'node:http';
import express, { Request, Response } from 'express';
import { Server as IOServer } from 'socket.io';
import { initBaileys, sock, currentStatus } from './baileys';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { ApiResponse } from './interfaces/ApiResponse';
import { LoginRequest, MenuRequest } from './interfaces/Requests';
import { UsuarioSchema } from './schemas/Usuario';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const users = new Map<string, string>();
const menus = [
  {
    id: 1,
    titulo: "Página inicial",
    icone: "House",
    rota: "/home",
    ordem: 1,
    menu_pai_id: null,
    data_criacao: "2025-05-20 19:51",
    data_edicao: "2025-05-20 19:51",
    global_id: 1,
    submenus: [],
  },
  {
    id: 2,
    titulo: "Gerenciar",
    icone: "MonitorCog",
    rota: "/app-gerenciar",
    ordem: 2,
    menu_pai_id: null,
    data_criacao: "2025-05-20 19:51",
    data_edicao: "2025-05-20 19:51",
    global_id: 2,
    submenus: [
      {
        id: 1,
        titulo: "Grupos",
        icone: "Users",
        rota: "/app-gerenciar/grupos",
        ordem: 1,
        menu_pai_id: 1,
        data_criacao: "2025-05-20 19:51",
        data_edicao: "2025-05-20 19:51",
        global_id: 3,
        submenus: [],
      },
    ],
  },
];

users.set("usuario", "16627182688");
users.set("senha", "123456");
users.set("email", "ismaelfreitas.santiago@gmail.com");
users.set("telefone", "37998247669");
users.set("avatar", "https://ui-avatars.com/api/?name=Ismael+Santiago");
users.set("menus", JSON.stringify(menus));

const secret: Secret = process.env.JWT_SECRET ?? 'default_secret';
const options: SignOptions = {
  expiresIn: (process.env.TOKEN_EXPIRY ?? '7d') as SignOptions['expiresIn'],
};

function generateToken(payload: UsuarioSchema): string {
  return jwt.sign(payload, secret, options);
}

async function listarGrupos() {

  let groups = [];

  try {
    const fetchGroups = await sock?.groupFetchAllParticipating() ?? {};

    for (const [jid, metadata] of Object.entries(fetchGroups)) {
      let image = undefined;

      try {
        image = await sock?.profilePictureUrl(jid, 'image');
      } catch (err) {
        // Se ocorrer um erro (por exemplo, grupo sem imagem), image permanecerá como ""
      }

      groups.push({
        id: jid,
        name: metadata.subject,
        participants: metadata.size,
        image: image ?? "https://cdn-icons-png.flaticon.com/512/8184/8184182.png"
      });
    }

  } catch (error) {
    console.error('Erro ao buscar grupos:', error);
  } finally {
    return groups;
  }
}

app.post('/auth/login', (req: Request, res: Response<ApiResponse<string>>) => {
  const { usuario, senha } = req.body as LoginRequest;

  if (!usuario || !senha) {
    res
      .status(400)
      .json({ success: false, message: 'Usuário e senha são obrigatórios.' });
  }

  const storedPassword = users.get("senha");
  if (storedPassword !== senha) {
    res
      .status(401)
      .json({ success: false, message: 'Credenciais inválidas.' });
  }

  try {
    const payload: UsuarioSchema = {
      usuario,
      senha,
      nome: users.get("nome") || "",
      email: users.get("email") || "",
      telefone: users.get("telefone") || "",
      avatar: users.get("avatar") || "",
    };

    const token = generateToken(payload);
    res.status(200).json({ success: true, data: token });
  } catch (err) {
    res.status(500).json({ success: false, message: `Erro ao gerar token.\nErro: ${err}` });
  }
});

app.get('/', (_: Request, res: Response<ApiResponse<null>>) => {
  res.status(200).json({ success: true, data: null, message: 'API rodando!' });
});

app.get('/consulta/usuarios', (req: Request, res: Response) => {
  res.status(200).json({
    cpf: users.get("usuario"),
    nome: users.get("senha"),
    email: users.get("email"),
    telefone: users.get("telefone"),
    avatar: users.get("avatar")
  });
})

app.get('/api/menus', (req: Request, res: Response<ApiResponse<MenuRequest[]>>) => {
  res.status(200).json({
    success: true,
    message: "Consulta realizada com sucesso",
    data: JSON.parse(users.get("menus") ?? "")
  });
})

const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  path: '/ws',
  cors: { origin: '*' }
});

io.on('connection', socket => {
  console.log('🧩 Cliente conectado:', socket.id);

  // Evita múltiplas execuções em reconexões
  const emitEvent = (event: any) => {

    io.emit('bot-event', event);
  };

  socket.on('get-whatsapp-status', () => {
    emitEvent({ origin: 'socket', status: currentStatus });
  });

  socket.on('get-groups', async () => {
    emitEvent({ origin: 'socket', status: currentStatus, groups: await listarGrupos() });
  });

  socket.on('reconnect-whatsapp', async () => {

    console.log('♻️ Requisição de reconexão manual recebida');
    emitEvent({ origin: "socket", status: "wa-reconnecting" });

    if (sock) sock.logout();
    initBaileys(emitEvent).catch(console.error);
  });

  // ✅ Inicialização automática (evita múltiplos initBaileys)
  if (!sock) {
    initBaileys(emitEvent).catch(console.error);
  }

  // ✅ Detecta desconexão e limpa recursos
  socket.on('disconnect', (reason) => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
    console.log(`📎 Motivo: ${reason}`);
    // Opcional: emitir status para outros clients ou registrar log
  });
});

httpServer.listen(3001, '0.0.0.0', () => {
  console.log('🚀 API & WS rodando em http://localhost:3001');
});
