/**
 * OperacionesService - SIO LAATS Formatos SEC
 * Catálogo maestro de aerolíneas, mapeo de formatos por aerolínea y filtrado por roles de seguridad.
 */

class OperacionesService {
  /**
   * Retorna el catálogo completo de formatos por aerolínea con sus respectivos rangos de acceso
   */
  static getCatalogoFormatosPorAerolinea() {
    return [
      // --- AEROMEXICO (AMX) ---
      {
        id: 'amx-cp',
        nombre: 'Control de Perimétrica (unificado)',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCPId',
        spConsulta: 'dbo.ConsultarDetallesCP',
        spComplementos: 'dbo.ConsultarComplementosCP',
        spActualizar: 'dbo.ActualizarDetalleCPJson',
        spActualizarComp: 'dbo.ActualizarComplementosCP',
        icono: 'shield-alt'
      },
      {
        id: 'amx-ciec',
        nombre: 'Control de ingreso y egreso cabina aeronave',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCIECId',
        spConsulta: 'dbo.ConsultarDetallesCIEC',
        spComplementos: 'dbo.ConsultarComplementosCIEC',
        spActualizar: 'dbo.SincronizarDetallesCIEC',
        spActualizarComp: 'dbo.ActualizarComplementosCIEC',
        icono: 'door-open'
      },
      {
        id: 'amx-er',
        nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlERId',
        spConsulta: 'dbo.ConsultarDetalleControlER',
        spComplementos: 'dbo.ConsultarComplementosControlER',
        spActualizar: 'dbo.EditarDetalleControlERJson',
        spActualizarComp: 'dbo.ActualizarComplementosControlER',
        icono: 'luggage-cart'
      },
      {
        id: 'amx-eb',
        nombre: 'Control de Equipajes en Banda de Salida (Rayos X)',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlEBId',
        spConsulta: 'dbo.ConsultarDetallesControlEB',
        spComplementos: 'dbo.ConsultarComplementosControlEB',
        spActualizar: 'dbo.EditarDetalleControlEBJson',
        spActualizarComp: 'dbo.EditarComponentesControlEB',
        icono: 'conveyor-belt'
      },
      {
        id: 'amx-cec',
        nombre: 'Control de Equipajes en Compartimentos',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCECId',
        spConsulta: 'dbo.ConsultarDetalleCECDesp',
        spComplementos: 'dbo.ConsultarComplementosCEC',
        spActualizar: 'dbo.ActualizarDetalleCECDespJson',
        spActualizarComp: 'dbo.ActualizarComplementosCEC',
        icono: 'box'
      },
      {
        id: 'amx-mecd',
        nombre: 'Equipajes en mal estado y carga dañada',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoEquipMECDId',
        spConsulta: 'dbo.BuscarEncabezadoEquipMECD',
        spActualizar: 'dbo.EditarEncabezadoEquipMECD',
        icono: 'exclamation-triangle'
      },
      {
        id: 'amx-po',
        nombre: 'Puestos por Operación',
        aerolinea: 'Aeromexico',
        codigoAerolinea: 'AMX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoPOId',
        spConsulta: 'dbo.ConsultarDetallesPO',
        spComplementos: 'dbo.ConsultarComplementosPO',
        spActualizar: 'dbo.EditarDetallePOJson',
        spActualizarComp: 'dbo.ActualizarComplementosPO',
        icono: 'users-cog'
      },

      // --- ARAJET ---
      {
        id: 'ara-cp',
        nombre: 'Control de Perimétrica (unificado)',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCPId',
        spConsulta: 'dbo.ConsultarDetallesCP',
        spComplementos: 'dbo.ConsultarComplementosCP',
        spActualizar: 'dbo.ActualizarDetalleCPJson',
        spActualizarComp: 'dbo.ActualizarComplementosCP',
        icono: 'shield-alt'
      },
      {
        id: 'ara-ciec',
        nombre: 'Control de ingreso y egreso cabina aeronave',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCIECId',
        spConsulta: 'dbo.ConsultarDetallesCIEC',
        spComplementos: 'dbo.ConsultarComplementosCIEC',
        spActualizar: 'dbo.SincronizarDetallesCIEC',
        spActualizarComp: 'dbo.ActualizarComplementosCIEC',
        icono: 'door-open'
      },
      {
        id: 'ara-er',
        nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlERId',
        spConsulta: 'dbo.ConsultarDetalleControlER',
        spComplementos: 'dbo.ConsultarComplementosControlER',
        spActualizar: 'dbo.EditarDetalleControlERJson',
        spActualizarComp: 'dbo.ActualizarComplementosControlER',
        icono: 'luggage-cart'
      },
      {
        id: 'ara-eb',
        nombre: 'Control de Equipajes en Banda de Salida (Rayos X)',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlEBId',
        spConsulta: 'dbo.ConsultarDetallesControlEB',
        spComplementos: 'dbo.ConsultarComplementosControlEB',
        spActualizar: 'dbo.EditarDetalleControlEBJson',
        spActualizarComp: 'dbo.EditarComponentesControlEB',
        icono: 'conveyor-belt'
      },
      {
        id: 'ara-cec',
        nombre: 'Control de Equipajes en Compartimentos',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCECId',
        spConsulta: 'dbo.ConsultarDetalleCECDesp',
        spComplementos: 'dbo.ConsultarComplementosCEC',
        spActualizar: 'dbo.ActualizarDetalleCECDespJson',
        spActualizarComp: 'dbo.ActualizarComplementosCEC',
        icono: 'box'
      },
      {
        id: 'ara-cfr',
        nombre: 'Control de Flejes en Rayos X',
        aerolinea: 'Arajet',
        codigoAerolinea: 'ARA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCFRId',
        spConsulta: 'dbo.ConsultarDetallesCFR',
        spComplementos: 'dbo.ConsultarComplementosCFR',
        spActualizar: 'dbo.EditarDetalleCFRJson',
        spActualizarComp: 'dbo.EditarComponentesCFR',
        icono: 'barcode'
      },

      // --- DELTA AIR LINES ---
      {
        id: 'dl-cp',
        nombre: 'Control de Perimétrica (unificado)',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCPId',
        spConsulta: 'dbo.ConsultarDetallesCP',
        spComplementos: 'dbo.ConsultarComplementosCP',
        spActualizar: 'dbo.ActualizarDetalleCPJson',
        spActualizarComp: 'dbo.ActualizarComplementosCP',
        icono: 'shield-alt'
      },
      {
        id: 'dl-cll',
        nombre: 'Cargo Loading Log',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCLLId',
        spConsulta: 'dbo.ConsultarDetalleCLL',
        spComplementos: 'dbo.ConsultarComplementosCLL',
        spActualizar: 'dbo.ActualizarDetalleCLL',
        spActualizarComp: 'dbo.ActualizarComplementosCLL',
        icono: 'truck-loading'
      },
      {
        id: 'dl-dal',
        nombre: 'Daily Activity Log',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'ItinerarioId',
        spConsulta: 'dbo.BuscarDetalleDAL',
        spActualizar: 'dbo.ActualizarDetalleDAL',
        icono: 'calendar-check'
      },
      {
        id: 'dl-sp',
        nombre: 'Selected Passenger',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoSPId',
        spConsulta: 'dbo.BuscarComplementosSP',
        spActualizar: 'dbo.ActualizarDetalleSPJson',
        icono: 'user-check'
      },
      {
        id: 'dl-sel',
        nombre: 'Sequence of Events Log',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'ItinerarioId',
        spConsulta: 'dbo.BuscarSEL',
        spActualizar: 'dbo.ActualizarSEL',
        icono: 'history'
      },
      {
        id: 'dl-er',
        nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlERId',
        spConsulta: 'dbo.ConsultarDetalleControlER',
        spComplementos: 'dbo.ConsultarComplementosControlER',
        spActualizar: 'dbo.EditarDetalleControlERJson',
        spActualizarComp: 'dbo.ActualizarComplementosControlER',
        icono: 'luggage-cart'
      },
      {
        id: 'dl-cec',
        nombre: 'Control de Equipajes en Compartimentos',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCECId',
        spConsulta: 'dbo.ConsultarDetalleCECDesp',
        spComplementos: 'dbo.ConsultarComplementosCEC',
        spActualizar: 'dbo.ActualizarDetalleCECDespJson',
        spActualizarComp: 'dbo.ActualizarComplementosCEC',
        icono: 'box'
      },
      {
        id: 'dl-ciec',
        nombre: 'Control de ingreso y egreso cabina aeronave',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCIECId',
        spConsulta: 'dbo.ConsultarDetallesCIEC',
        spComplementos: 'dbo.ConsultarComplementosCIEC',
        spActualizar: 'dbo.SincronizarDetallesCIEC',
        spActualizarComp: 'dbo.ActualizarComplementosCIEC',
        icono: 'door-open'
      },
      {
        id: 'dl-rx',
        nombre: 'Control de Equipaje en rayos X',
        aerolinea: 'Delta',
        codigoAerolinea: 'DAL',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'ItinerarioId',
        spConsulta: 'dbo.ConsultarDRayosXSEC',
        spActualizar: 'dbo.ActualizarDRayosXSEC',
        icono: 'x-ray'
      },

      // --- AIR CANADA (ACA) ---
      {
        id: 'ac-cp',
        nombre: 'Control de Perimétrica (unificado)',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCPId',
        spConsulta: 'dbo.ConsultarDetallesCP',
        spComplementos: 'dbo.ConsultarComplementosCP',
        spActualizar: 'dbo.ActualizarDetalleCPJson',
        spActualizarComp: 'dbo.ActualizarComplementosCP',
        icono: 'shield-alt'
      },
      {
        id: 'ac-er',
        nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlERId',
        spConsulta: 'dbo.ConsultarDetalleControlER',
        spComplementos: 'dbo.ConsultarComplementosControlER',
        spActualizar: 'dbo.EditarDetalleControlERJson',
        spActualizarComp: 'dbo.ActualizarComplementosControlER',
        icono: 'luggage-cart'
      },
      {
        id: 'ac-eb',
        nombre: 'Control de Equipajes en Banda de Salida (Rayos X)',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoControlEBId',
        spConsulta: 'dbo.ConsultarDetallesControlEB',
        spComplementos: 'dbo.ConsultarComplementosControlEB',
        spActualizar: 'dbo.EditarDetalleControlEBJson',
        spActualizarComp: 'dbo.EditarComponentesControlEB',
        icono: 'conveyor-belt'
      },
      {
        id: 'ac-cec',
        nombre: 'Control de Equipajes en Compartimentos',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCECId',
        spConsulta: 'dbo.ConsultarDetalleCECDesp',
        spComplementos: 'dbo.ConsultarComplementosCEC',
        spActualizar: 'dbo.ActualizarDetalleCECDespJson',
        spActualizarComp: 'dbo.ActualizarComplementosCEC',
        icono: 'box'
      },
      {
        id: 'ac-ass',
        nombre: 'Aircraft Security Search',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoASSId',
        spConsulta: 'dbo.BuscarASS',
        spActualizar: 'dbo.ActualizarASS',
        icono: 'clipboard-check'
      },
      {
        id: 'ac-anexoa',
        nombre: 'Anexo A / Aircraft Access Control Log Sheet',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoAnexoAId',
        spConsulta: 'dbo.BuscarAnexoA',
        spActualizar: 'dbo.ActualizarAnexoA',
        icono: 'file-signature'
      },
      {
        id: 'ac-anexob',
        nombre: 'Annex B, to aircraft security search checklist',
        aerolinea: 'Air Canada',
        codigoAerolinea: 'ACA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoAnexoBId',
        spConsulta: 'dbo.BuscarAnexoB',
        spActualizar: 'dbo.ActualizarAnexoB',
        icono: 'tasks'
      },

      // --- LAN CARGO / LATAM ---
      {
        id: 'latam-liadc',
        nombre: 'Lista de Inspección de Aeronave de Carga',
        aerolinea: 'LAN CARGO',
        codigoAerolinea: 'LCO',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoLIADCId',
        spConsulta: 'dbo.BuscarLIADC',
        spActualizar: 'dbo.ActualizarLIADC',
        icono: 'clipboard-list'
      },
      {
        id: 'latam-ciec',
        nombre: 'Control de ingreso y egreso cabina aeronave',
        aerolinea: 'LAN CARGO',
        codigoAerolinea: 'LCO',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCIECId',
        spConsulta: 'dbo.ConsultarDetallesCIEC',
        spComplementos: 'dbo.ConsultarComplementosCIEC',
        spActualizar: 'dbo.SincronizarDetallesCIEC',
        spActualizarComp: 'dbo.ActualizarComplementosCIEC',
        icono: 'door-open'
      },
      {
        id: 'latam-cp',
        nombre: 'Control de Perimétrica (unificado)',
        aerolinea: 'LAN CARGO',
        codigoAerolinea: 'LCO',
        rangos: ['AGENTE', 'SUPERVISOR'],
        paramEncabezado: 'EncabezadoCPId',
        spConsulta: 'dbo.ConsultarDetallesCP',
        spComplementos: 'dbo.ConsultarComplementosCP',
        spActualizar: 'dbo.ActualizarDetalleCPJson',
        spActualizarComp: 'dbo.ActualizarComplementosCP',
        icono: 'shield-alt'
      },

      // --- FEDEX ---
      {
        id: 'fdx-ccda',
        nombre: 'Control de Cargue y Descargue de Aeronave',
        aerolinea: 'FedEx',
        codigoAerolinea: 'FDX',
        rangos: ['AGENTE', 'SUPERVISOR'],
        spConsulta: 'dbo.BuscarCCDA',
        spActualizar: 'dbo.ActualizarCCDA',
        icono: 'dolly'
      },

      // --- AMERIJET ---
      {
        id: 'ajt-lisa',
        nombre: 'Lista de Inspección de Seguridad de la Aeronave',
        aerolinea: 'Amerijet',
        codigoAerolinea: 'AJT',
        rangos: ['AGENTE', 'SUPERVISOR'],
        spConsulta: 'dbo.BuscarLISA',
        spActualizar: 'dbo.ActualizarLISA',
        icono: 'clipboard-check'
      },
      {
        id: 'ajt-cec',
        nombre: 'Control de Equipajes en Compartimentos',
        aerolinea: 'Amerijet',
        codigoAerolinea: 'AJT',
        rangos: ['AGENTE', 'SUPERVISOR'],
        spConsulta: 'dbo.ConsultarDetalleCECDesp',
        spActualizar: 'dbo.ActualizarDetalleCECDespJson',
        icono: 'box'
      },
      {
        id: 'ajt-ciec',
        nombre: 'Control de ingreso y egreso cabina aeronave',
        aerolinea: 'Amerijet',
        codigoAerolinea: 'AJT',
        rangos: ['AGENTE', 'SUPERVISOR'],
        spConsulta: 'dbo.ConsultarDetallesCIEC',
        spActualizar: 'dbo.SincronizarDetallesCIEC',
        icono: 'door-open'
      },

      // --- AVIANCA / TAMPA CARGO ---
      {
        id: 'ava-diamante',
        nombre: 'CONTROL DE ACCESO AERONAVE/DIAMANTE DE SEGURIDAD',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'gem'
      },
      {
        id: 'ava-novedades',
        nombre: 'REPORTE DE NOVEDADES OPERACIÓN',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'file-alt'
      },
      {
        id: 'ava-custodia',
        nombre: 'REGISTRO DE CUSTODIA DE CARGA',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'shield-virus'
      },
      {
        id: 'ava-piezas',
        nombre: 'SEGURIDAD GUA/ PIEZAS DAÑADAS, ABIERTS O SAQUEADAS CIERRES DE VUELOS EN BC, BS1-BS2/ CONTROL Y CUSTODIA DE EQUIPAJE FACTURADO',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'tools'
      },
      {
        id: 'ava-secundaria',
        nombre: 'REGISTRO INPECCION SECUNDARIA DE PASAJEROS/ LISTA DE CHEQUEO AREAS ESTERILES',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'user-secret'
      },
      {
        id: 'ava-prohibidos',
        nombre: 'ARTICULOS PROHIBIDOS DETECTADOS',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'ban'
      },
      {
        id: 'ava-cocinas',
        nombre: 'INVENTARIO DE COCINAS',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'utensils'
      },
      {
        id: 'ava-anexoc',
        nombre: 'PROGRAMA DE SEGURIDAD ANEXO C',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'book'
      },
      {
        id: 'ava-equipaje',
        nombre: 'INPECCION Y CONTROL DE EQUIPAJE',
        aerolinea: 'Avianca',
        codigoAerolinea: 'AVA',
        rangos: ['AGENTE', 'SUPERVISOR'],
        icono: 'suitcase'
      }
    ];
  }

  /**
   * Filtra los formatos por nombre de aerolínea y por el puesto del usuario (AGENTE / SUPERVISOR)
   * @param {string} aerolinea
   * @param {string} puestoUsuario
   */
  static obtenerFormatosParaAerolinea(aerolinea, puestoUsuario = 'AGENTE') {
    const todos = this.getCatalogoFormatosPorAerolinea();
    const rolNormalizado = (puestoUsuario || '').toUpperCase();
    const aeroNormalizada = (aerolinea || '').toUpperCase();

    return todos.filter(f => {
      const coincideAero = f.aerolinea.toUpperCase() === aeroNormalizada ||
        (aeroNormalizada.includes('DELTA') && f.aerolinea.toUpperCase() === 'DELTA') ||
        (aeroNormalizada.includes('AEROMEXICO') && f.aerolinea.toUpperCase() === 'AEROMEXICO') ||
        (aeroNormalizada.includes('ARAJET') && f.aerolinea.toUpperCase() === 'ARAJET') ||
        (aeroNormalizada.replace(/\s+/g, '').includes('AIRCANADA') && f.aerolinea.toUpperCase() === 'AIR CANADA') ||
        ((aeroNormalizada.includes('LATAM') || aeroNormalizada.replace(/\s+/g, '').includes('LANCARGO')) && f.aerolinea.toUpperCase().includes('LAN CARGO')) ||
        (aeroNormalizada.includes('TAMPA') && f.aerolinea.toUpperCase().includes('AVIANCA'));

      const coincideRol = f.rangos.some(r => rolNormalizado.includes(r.toUpperCase()));

      return coincideAero && coincideRol;
    });
  }
}

module.exports = OperacionesService;

