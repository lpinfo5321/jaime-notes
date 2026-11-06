import LogView from "@/components/log/LogView";

/** La página no consulta nada en el servidor: abre al instante y LogView carga (y guarda en caché) los datos. */
export default function RegistroPage() {
  return <LogView />;
}
