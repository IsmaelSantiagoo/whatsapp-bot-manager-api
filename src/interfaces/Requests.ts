export interface LoginRequest {
  usuario: string;
  senha: string;
}

export interface MenuRequest {
  id: number;
  titulo: string;
  icone: string | null;
  rota: string | null;
  ordem: number;
  menu_pai_id: number | null;
  data_criacao: string;
  data_edicao: string;
  global_id: string;
  submenus: MenuRequest[];
};
