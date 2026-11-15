/**
 * FormatosModel - SIO LAATS Formatos SEC
 * Modelado y ejecución parametrizada hacia los Procedimientos Almacenados de Seguridad Operacional.
 * REGLAS: Sin concatenación, Soft Delete, soporte para Reanudar o Crear Nuevo.
 */

const { sql, getConnection, executeQuery, executeStoredProcedure } = require('../config/database');

class FormatosModel {
  /**
   * Obtiene los formatos ya creados/iniciados para un itinerario dado
   * @param {number} itinerarioId
   */
  static async obtenerFormatosPorItinerario(itinerarioId) {
    try {
      const params = [
        { name: 'ItinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) }
      ];
      const result = await executeStoredProcedure('dbo.ObtenerFormatosSEC', params);
      const rows = result.recordsets[0] || [];
      if (rows.length > 0 && (rows[0].Mensaje || rows[0].mensaje)) {
        return [];
      }
      return rows.map(r => ({
        ...r,
        TipoFormato: String(r.TipoFormato || '').replace(/daÃ±ada/gi, 'dañada')
      }));
    } catch (err) {
      console.warn('[SP ObtenerFormatosSEC WARN] Procedimiento no disponible, usando fallback directo:', err.message);
      // Fallback si la tabla FormatoEncabezadoSEC existe
      try {
        const q = `
          SELECT 
            FormatoEncabezadoId,
            TipoFormato,
            FechaCreacion,
            CreadoPor,
            OperadorId,
            ItinerarioId
          FROM FormatoEncabezadoSEC
          WHERE ItinerarioId = @itinerarioId
            AND ISNULL(EstaEliminado, 0) = 0
          ORDER BY FechaCreacion DESC
        `;
        const res = await executeQuery(q, [{ name: 'itinerarioId', type: sql.Int, value: itinerarioId }]);
        return res.recordset;
      } catch (_) {
        return [];
      }
    }
  }

  /**
   * Consulta datos de un formato específico por su procedimiento de lectura
   * @param {string} spName - Nombre del procedimiento almacenado
   * @param {Array<{name: string, type: any, value: any}>} params - Parámetros
   */
  static async consultarDetalleFormato(spName, params = []) {
    return await executeStoredProcedure(spName, params);
  }

  /**
   * Guarda o actualiza un formato mediante su procedimiento de guardado
   * @param {string} spName - Nombre del SP de actualización
   * @param {Array<{name: string, type: any, value: any}>} params - Parámetros con .input()
   */
  static async guardarDetalleFormato(spName, params = []) {
    return await executeStoredProcedure(spName, params);
  }

  /**
   * Consulta el último encabezado generado para correlativos y trazabilidad
   * @param {string} tipoFormato
   * @param {number} itinerarioId
   */
  static async obtenerUltimoEncabezado(tipoFormato, itinerarioId) {
    try {
      const params = [
        { name: 'TipoFormato', type: sql.NVarChar(150), value: tipoFormato },
        { name: 'ItinerarioId', type: sql.BigInt, value: itinerarioId }
      ];
      const result = await executeStoredProcedure('dbo.ObtenerUltimoEncabezadoSEC', params);
      return result.recordset[0] || null;
    } catch (err) {
      console.warn('[ObtenerUltimoEncabezadoSEC WARN]', err.message);
      return null;
    }
  }

  /**
   * Obtiene empleados activos para catálogos de Tractorista / Aleros
   */
  static async obtenerEmpleadosActivos() {
    const query = `
      SELECT
        EmpleadoId,
        Nombre,
        Codigo
      FROM Empleado
      WHERE ISNULL(EstaEliminado, 0) = 0
      ORDER BY Nombre ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene maquinaria activa desde MaquinariaLAATS para selección de No. Unidad
   */
  static async obtenerMaquinariaActiva() {
    const query = `
      SELECT
        MaquinariaEquipoId,
        NoUnidad,
        TipoMaquinaria
      FROM MaquinariaLAATS
      WHERE ISNULL(EstaEliminado, 0) = 0
      ORDER BY NoUnidad ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Ejecuta Soft Delete sobre un formato de seguridad
   * @param {string} tableName - Tabla de la entidad
   * @param {string} idColumn - Columna clave primaria
   * @param {number} id - Valor ID
   * @param {string} usuarioModifica - Usuario que efectúa la acción
   */
  static async softDelete(tableName, idColumn, id, usuarioModifica) {
    // Lista blanca estricta de tablas para prevenir inyección de nombres de tabla
    const allowedTables = [
      'FormatoEncabezadoSEC', 'DetalleCP', 'DetalleCIEC', 'DetalleControlER', 
      'DetalleControlEB', 'DetalleCEC', 'DetalleCFR', 'DetalleCLL', 'DetalleSP', 'DetalleDAL', 'DetalleSEL',
      'EncabezadoDRayosX', 'PersonalSAG', 'PersonalLaats', 'EncabezadoCLL', 'EncabezadoSP',
      'EncabezadoASS', 'DetalleASS', 'ObservacionesASS',
      'EncabezadoAnexoA', 'DetalleAnexoA', 'ObservacionesAnexoA',
      'EncabezadoAnexoB', 'DetalleAnexoB',
      'EncabezadoLIADC', 'ItinerariosLIADC', 'DetalleLIADC', 'ObservacionesLIADC'
    ];
    if (!allowedTables.includes(tableName)) {
      throw new Error('Tabla no autorizada para operación Soft Delete.');
    }

    const tablesWithoutModificado = new Set([
      'EncabezadoASS', 'DetalleASS', 'ObservacionesASS',
      'EncabezadoLIADC', 'ItinerariosLIADC', 'DetalleLIADC', 'ObservacionesLIADC'
    ]);
    const setClause = tablesWithoutModificado.has(tableName)
      ? 'SET EstaEliminado = 1'
      : `SET EstaEliminado = 1,
          ModificadoPor = @usuarioModifica,
          Modificado = GETDATE()`;

    const query = `
      UPDATE ${tableName}
      ${setClause}
      WHERE ${idColumn} = @id
        AND ISNULL(EstaEliminado, 0) = 0
    `;

    const params = [
      { name: 'usuarioModifica', type: sql.NVarChar(100), value: usuarioModifica },
      { name: 'id', type: sql.BigInt, value: id }
    ];

    return await executeQuery(query, params);
  }

  /**
   * Verifica que un EncabezadoControlERId pertenezca al ItinerarioId activo (Prevención Anti-IDOR)
   * @param {number} encabezadoId
   * @param {number} itinerarioId
   */
  static async verificarPropiedadControlER(encabezadoId, itinerarioId) {
    const query = `
      SELECT TOP 1
        E.EncabezadoControlERId,
        I.ItinerarioId,
        E.Fecha,
        E.CreadoPor
      FROM dbo.EncabezadoControlER E
      INNER JOIN dbo.ItinerariosControlER I
        ON E.EncabezadoControlERId = I.EncabezadoControlERId
      WHERE E.EncabezadoControlERId = @encabezadoId
        AND I.ItinerarioId = @itinerarioId
        AND ISNULL(E.EstaEliminado, 0) = 0
        AND ISNULL(I.EstaEliminado, 0) = 0
    `;
    const params = [
      { name: 'encabezadoId', type: sql.Int, value: parseInt(encabezadoId, 10) },
      { name: 'itinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) }
    ];
    const res = await executeQuery(query, params);
    return res.recordset[0] || null;
  }

  /**
   * Guarda o actualiza de forma atómica y 100% parametrizada el formato
   * "Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (Rayos X)" (ControlER)
   * Cumple: sql.Transaction (commit/rollback), 100% .input(), Soft Delete (EstaEliminado = 1),
   * y trazabilidad de auditoría desde sesión del servidor.
   *
   * @param {Object} params
   * @param {number} params.encabezadoId - 0 para crear nuevo, > 0 para actualizar existente
   * @param {number} params.itinerarioId - ID del itinerario/operación activa
   * @param {number} params.loginId - LoginId del agente autenticado
   * @param {number} params.empleadoId - EmpleadoId del agente autenticado
   * @param {string} params.usuarioAuditoria - Usuario de sesión (req.session.user.usuario)
   * @param {string} params.fechaIso - Fecha en formato YYYY-MM-DD
   * @param {string} params.observaciones - Observaciones opcionales
   * @param {Array<Object>} params.registros - Filas validadas de la cuadrícula fluida
   */
  static async guardarControlERTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    empleadoId,
    usuarioAuditoria,
    fechaIso,
    observaciones = '',
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetEncabezadoId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const totalCantidad = registros.length;
      const obsTrimmed = String(observaciones || '').trim();
      let filasEliminadasSoft = 0;

      if (targetEncabezadoId > 0) {
        // 1. Verificar pertenencia del EncabezadoControlERId al ItinerarioId dentro de la transacción (Anti-IDOR)
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoControlERId
          FROM dbo.EncabezadoControlER E
          INNER JOIN dbo.ItinerariosControlER I
            ON E.EncabezadoControlERId = I.EncabezadoControlERId
          WHERE E.EncabezadoControlERId = @EncabezadoControlERId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);

        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado o registro inexistente: El EncabezadoControlERId #${targetEncabezadoId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        // 2. Actualizar Fecha en EncabezadoControlER
        const reqUpdHeader = new sql.Request(transaction);
        reqUpdHeader.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqUpdHeader.input('Fecha', sql.Date, fechaDate);
        await reqUpdHeader.query(`
          UPDATE dbo.EncabezadoControlER
          SET Fecha = @Fecha
          WHERE EncabezadoControlERId = @EncabezadoControlERId
            AND ISNULL(EstaEliminado, 0) = 0
        `);

        // 3. Sincronizar TotalEquipajesER (Upsert)
        const reqTotal = new sql.Request(transaction);
        reqTotal.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqTotal.input('Cantidad', sql.Int, totalCantidad);
        reqTotal.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
        await reqTotal.query(`
          IF EXISTS (
            SELECT 1 FROM dbo.TotalEquipajesER
            WHERE EncabezadoControlERId = @EncabezadoControlERId
              AND ISNULL(EstaEliminado, 0) = 0
          )
          BEGIN
            UPDATE dbo.TotalEquipajesER
            SET Cantidad = @Cantidad
            WHERE EncabezadoControlERId = @EncabezadoControlERId
              AND ISNULL(EstaEliminado, 0) = 0;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.TotalEquipajesER (EncabezadoControlERId, Cantidad, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoControlERId, @Cantidad, @CreadoPor, GETDATE(), 0);
          END
        `);

        // 4. Sincronizar ObservacionesER (Upsert o Soft Delete si se dejó en blanco)
        const reqObs = new sql.Request(transaction);
        reqObs.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqObs.input('Observacion', sql.NVarChar(sql.MAX), obsTrimmed);
        reqObs.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
        if (obsTrimmed !== '') {
          await reqObs.query(`
            IF EXISTS (
              SELECT 1 FROM dbo.ObservacionesER
              WHERE EncabezadoControlERId = @EncabezadoControlERId
                AND ISNULL(EstaEliminado, 0) = 0
            )
            BEGIN
              UPDATE dbo.ObservacionesER
              SET Observacion = @Observacion
              WHERE EncabezadoControlERId = @EncabezadoControlERId
                AND ISNULL(EstaEliminado, 0) = 0;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.ObservacionesER (EncabezadoControlERId, Observacion, CreadoPor, Creado, EstaEliminado)
              VALUES (@EncabezadoControlERId, @Observacion, @CreadoPor, GETDATE(), 0);
            END
          `);
        } else {
          await reqObs.query(`
            UPDATE dbo.ObservacionesER
            SET EstaEliminado = 1
            WHERE EncabezadoControlERId = @EncabezadoControlERId
              AND ISNULL(EstaEliminado, 0) = 0
          `);
        }

        // 5. Soft Delete (EstaEliminado = 1) de filas que existían en BD pero fueron retiradas de la cuadrícula
        const reqExistingRows = new sql.Request(transaction);
        reqExistingRows.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        const existingRowsRes = await reqExistingRows.query(`
          SELECT DetalleControlERId
          FROM dbo.DetalleControlER
          WHERE EncabezadoControlERId = @EncabezadoControlERId
            AND ISNULL(EstaEliminado, 0) = 0
        `);

        const incomingIds = new Set(
          registros
            .map(r => parseInt(r.DetalleControlERId, 10))
            .filter(id => Number.isFinite(id) && id > 0)
        );

        for (const dbRow of existingRowsRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleControlERId, 10);
          if (!incomingIds.has(dbId)) {
            const reqSoftDel = new sql.Request(transaction);
            reqSoftDel.input('DetalleControlERId', sql.Int, dbId);
            reqSoftDel.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
            await reqSoftDel.query(`
              UPDATE dbo.DetalleControlER
              SET EstaEliminado = 1
              WHERE DetalleControlERId = @DetalleControlERId
                AND EncabezadoControlERId = @EncabezadoControlERId
                AND ISNULL(EstaEliminado, 0) = 0
            `);
            filasEliminadasSoft += 1;
          }
        }
      } else {
        // MODO CREACIÓN (NUEVO ENCABEZADO)
        // 1. Insertar en EncabezadoControlER
        const reqInsHeader = new sql.Request(transaction);
        reqInsHeader.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqInsHeader.input('Fecha', sql.Date, fechaDate);
        reqInsHeader.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
        const insHeaderRes = await reqInsHeader.query(`
          INSERT INTO dbo.EncabezadoControlER (LoginId, Fecha, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoControlERId
          VALUES (@LoginId, @Fecha, @CreadoPor, GETDATE(), 0)
        `);

        targetEncabezadoId = parseInt(insHeaderRes.recordset?.[0]?.EncabezadoControlERId, 10) || 0;
        if (targetEncabezadoId <= 0) {
          throw new Error('No se pudo generar el identificador EncabezadoControlERId en Azure SQL.');
        }

        // 2. Vincular con el itinerario en ItinerariosControlER
        const reqInsIti = new sql.Request(transaction);
        reqInsIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqInsIti.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        await reqInsIti.query(`
          INSERT INTO dbo.ItinerariosControlER (ItinerarioId, EncabezadoControlERId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoControlERId, 0)
        `);

        // 3. Insertar recuento total en TotalEquipajesER
        const reqInsTotal = new sql.Request(transaction);
        reqInsTotal.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqInsTotal.input('Cantidad', sql.Int, totalCantidad);
        reqInsTotal.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
        await reqInsTotal.query(`
          INSERT INTO dbo.TotalEquipajesER (EncabezadoControlERId, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoControlERId, @Cantidad, @CreadoPor, GETDATE(), 0)
        `);

        // 4. Insertar observaciones si existen en ObservacionesER
        if (obsTrimmed !== '') {
          const reqInsObs = new sql.Request(transaction);
          reqInsObs.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
          reqInsObs.input('Observacion', sql.NVarChar(sql.MAX), obsTrimmed);
          reqInsObs.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
          await reqInsObs.query(`
            INSERT INTO dbo.ObservacionesER (EncabezadoControlERId, Observacion, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoControlERId, @Observacion, @CreadoPor, GETDATE(), 0)
          `);
        }
      }

      // 6. Insertar o actualizar cada fila activa de la cuadrícula en DetalleControlER
      const detallesPersistidos = [];
      for (const row of registros) {
        const detalleId = parseInt(row.DetalleControlERId, 10) || 0;
        const reqRow = new sql.Request(transaction);
        reqRow.input('EncabezadoControlERId', sql.Int, targetEncabezadoId);
        reqRow.input('Pasajero', sql.NVarChar(200), row.Pasajero);
        reqRow.input('Secuencia', sql.Int, row.Secuencia);
        reqRow.input('Colilla', sql.Int, row.Colilla);
        reqRow.input('Destino', sql.NVarChar(100), row.Destino || 'N/A');
        reqRow.input('HoraRevision', sql.NVarChar(10), row.HoraRevision);
        reqRow.input('AgenteAVSEC', sql.NVarChar(150), row.AgenteAVSEC);
        reqRow.input('EmpleadoId', sql.Int, parseInt(empleadoId, 10) || 0);
        reqRow.input('AgenteSeguridad', sql.NVarChar(150), row.AgenteSeguridad || usuarioAuditoria);

        if (detalleId > 0 && encabezadoId > 0) {
          reqRow.input('DetalleControlERId', sql.Int, detalleId);
          await reqRow.query(`
            UPDATE dbo.DetalleControlER
            SET Pasajero = @Pasajero,
                Secuencia = @Secuencia,
                Colilla = @Colilla,
                Destino = @Destino,
                HoraRevision = @HoraRevision,
                AgenteAVSEC = @AgenteAVSEC,
                CreadoPor = @AgenteSeguridad
            WHERE DetalleControlERId = @DetalleControlERId
              AND EncabezadoControlERId = @EncabezadoControlERId
              AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...row, DetalleControlERId: detalleId });
        } else {
          const insRowRes = await reqRow.query(`
            INSERT INTO dbo.DetalleControlER (
              EncabezadoControlERId,
              Pasajero,
              Secuencia,
              Colilla,
              Destino,
              HoraRevision,
              AgenteAVSEC,
              EmpleadoId,
              CreadoPor,
              Creado,
              EstaEliminado
            )
            OUTPUT INSERTED.DetalleControlERId
            VALUES (
              @EncabezadoControlERId,
              @Pasajero,
              @Secuencia,
              @Colilla,
              @Destino,
              @HoraRevision,
              @AgenteAVSEC,
              @EmpleadoId,
              @AgenteSeguridad,
              GETDATE(),
              0
            )
          `);
          const newDetId = parseInt(insRowRes.recordset?.[0]?.DetalleControlERId, 10) || 0;
          detallesPersistidos.push({ ...row, DetalleControlERId: newDetId });
        }
      }

      await transaction.commit();

      return {
        encabezadoId: targetEncabezadoId,
        totalEquipajes: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try {
        await transaction.rollback();
      } catch (rbErr) {
        console.error('[CONTROL ER ROLLBACK ERROR]', rbErr.message);
      }
      throw err;
    }
  }

  /**
   * Obtiene el catálogo de posiciones de Puestos por Operación (PosicionesPO)
   */
  static async obtenerPosicionesPO() {
    const query = `
      SELECT
        PosicionesPOId,
        Posiciones
      FROM dbo.PosicionesPO
      ORDER BY PosicionesPOId ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene la cabecera de Control Ingreso y Egreso Cabina (EncabezadoCIEC)
   * @param {number} encabezadoId
   */
  static async obtenerEncabezadoCIEC(encabezadoId) {
    const query = `
      SELECT TOP 1
        EncabezadoCIECId,
        Fecha,
        HoraInicio,
        EmpleadoId,
        CreadoPor,
        Creado
      FROM dbo.EncabezadoCIEC
      WHERE EncabezadoCIECId = @encabezadoId
        AND ISNULL(EstaEliminado, 0) = 0
    `;
    const res = await executeQuery(query, [
      { name: 'encabezadoId', type: sql.Int, value: parseInt(encabezadoId, 10) }
    ]);
    return res.recordset[0] || null;
  }

  /**
   * Consulta completa de Equipajes en Mal Estado y Carga Dañada (MECD)
   * @param {number} encabezadoId
   */
  static async consultarTodoEquipMECD(encabezadoId) {
    const encId = parseInt(encabezadoId, 10);
    const param = [{ name: 'EncabezadoEquipMECDId', type: sql.Int, value: encId }];
    const [encRes, revRes, meRes, dtRes] = await Promise.all([
      executeStoredProcedure('dbo.BuscarEncabezadoEquipMECD', param),
      executeStoredProcedure('dbo.ConsultarDetalleRevMECD', param),
      executeStoredProcedure('dbo.ConsultarDetalleEquipajeME', param),
      executeStoredProcedure('dbo.ConsultarDetalleDT', param)
    ]);
    return {
      encabezado: encRes.recordsets?.[0]?.[0] || null,
      revisiones: revRes.recordsets?.[0] || [],
      conFirma: meRes.recordsets?.[0] || [],
      sinFirma: dtRes.recordsets?.[0] || []
    };
  }

  /**
   * Verifica pertenencia de un encabezado de formato al ItinerarioId activo (Prevención Anti-IDOR)
   * @param {'eb'|'cec'|'ciec'|'mecd'|'po'|'cp'} family
   * @param {number} encabezadoId
   * @param {number} itinerarioId
   */
  static async verificarPropiedadFormato(family, encabezadoId, itinerarioId) {
    if (family === 'dal') {
      const res = await executeQuery(`
        SELECT TOP 1 DetalleDALId AS EncabezadoId, ItinerarioId
        FROM dbo.DetalleDAL
        WHERE DetalleDALId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
      `, [
        { name: 'encabezadoId', type: sql.Int, value: parseInt(encabezadoId, 10) },
        { name: 'itinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) }
      ]);
      return res.recordset[0] || null;
    }

    if (family === 'sel') {
      const res = await executeQuery(`
        SELECT TOP 1 DetalleSELId AS EncabezadoId, ItinerarioId
        FROM dbo.DetalleSEL
        WHERE DetalleSELId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
      `, [
        { name: 'encabezadoId', type: sql.Int, value: parseInt(encabezadoId, 10) },
        { name: 'itinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) }
      ]);
      return res.recordset[0] || null;
    }

    const map = {
      cp: { encTable: 'dbo.EncabezadoCP', itiTable: 'dbo.ItinerariosCP', pk: 'EncabezadoCPId', fk: 'EncabezadoCPId' },
      eb: { encTable: 'dbo.EncabezadoControlEB', itiTable: 'dbo.ItinerariosControlEB', pk: 'EncabezadoControlEBId', fk: 'EncabezadoControlEB' },
      cec: { encTable: 'dbo.EncabezadoCEC', itiTable: 'dbo.ItinerariosCEC', pk: 'EncabezadoCECId', fk: 'EncabezadoCECId' },
      ciec: { encTable: 'dbo.EncabezadoCIEC', itiTable: 'dbo.ItinerariosCIEC', pk: 'EncabezadoCIECId', fk: 'EncabezadoCIECId' },
      mecd: { encTable: 'dbo.EncabezadoEquipMECD', itiTable: 'dbo.ItinerariosEquipMECD', pk: 'EncabezadoEquipMECDId', fk: 'EncabezadoEquipMECDId' },
      po: { encTable: 'dbo.EncabezadoPO', itiTable: 'dbo.ItinerariosPO', pk: 'EncabezadoPOId', fk: 'EncabezadoPOId' },
      cfr: { encTable: 'dbo.EncabezadoCFR', itiTable: 'dbo.ItinerariosCFR', pk: 'EncabezadoCFRId', fk: 'EncabezadoCFRId' },
      rx: { encTable: 'dbo.EncabezadoDRayosX', itiTable: 'dbo.ItinerariosDRayosX', pk: 'EncabezadoDRayosXId', fk: 'EncabezadoDRayosXId' },
      cll: { encTable: 'dbo.EncabezadoCLL', itiTable: 'dbo.ItinerariosCLL', pk: 'EncabezadoCLLId', fk: 'EncabezadoCLLId' },
      sp: { encTable: 'dbo.EncabezadoSP', itiTable: 'dbo.ItinerariosSP', pk: 'EncabezadoSPId', fk: 'EncabezadoSPId' },
      ass: { encTable: 'dbo.EncabezadoASS', itiTable: 'dbo.ItinerariosASS', pk: 'EncabezadoASSId', fk: 'EncabezadoASSId' },
      anexoa: { encTable: 'dbo.EncabezadoAnexoA', itiTable: 'dbo.ItinerariosAnexoA', pk: 'EncabezadoAnexoAId', fk: 'EncabezadoAnexoAId' },
      anexob: { encTable: 'dbo.EncabezadoAnexoB', itiTable: 'dbo.ItinerariosAnexoB', pk: 'EncabezadoAnexoBId', fk: 'EncabezadoAnexoBId' },
      liadc: { encTable: 'dbo.EncabezadoLIADC', itiTable: 'dbo.ItinerariosLIADC', pk: 'EncabezadoLIADCId', fk: 'EncabezadoLIADCId' }
    };
    const cfg = map[family];
    if (!cfg) return null;

    const query = `
      SELECT TOP 1 E.${cfg.pk} AS EncabezadoId, I.ItinerarioId
      FROM ${cfg.encTable} E
      INNER JOIN ${cfg.itiTable} I ON E.${cfg.pk} = I.${cfg.fk}
      WHERE E.${cfg.pk} = @encabezadoId
        AND I.ItinerarioId = @itinerarioId
        AND ISNULL(E.EstaEliminado, 0) = 0
        AND ISNULL(I.EstaEliminado, 0) = 0
    `;
    const res = await executeQuery(query, [
      { name: 'encabezadoId', type: sql.Int, value: parseInt(encabezadoId, 10) },
      { name: 'itinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) }
    ]);
    return res.recordset[0] || null;
  }

  /**
   * 1. Guarda/actualiza atómicamente "Control de Equipajes en Banda de Salida (Rayos X)" (ControlEB)
   */
  static async guardarControlEBTransaccional({
    encabezadoId = 0,
    itinerarioId,
    supervisorLoginId,
    usuarioAuditoria,
    fechaIso,
    horaInicio,
    horaCierre,
    nombreOperador,
    correosCantidad = 0,
    comatCantidad = 0,
    eqTransitoCantidad = 0,
    observaciones = '',
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const obsTrimmed = String(observaciones || '').trim();
      let filasEliminadasSoft = 0;

      // Solo persiste como activos en BD los registros cuya secuencia no esté anulada con 'X'
      const registrosActivos = registros.filter(r => String(r.Valor || '').toUpperCase() !== 'X' && Number(r.Secuencia) > 0);

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoControlEBId
          FROM dbo.EncabezadoControlEB E
          INNER JOIN dbo.ItinerariosControlEB I ON E.EncabezadoControlEBId = I.EncabezadoControlEB
          WHERE E.EncabezadoControlEBId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoControlEBId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(supervisorLoginId, 10) || 1);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('Hora', sql.NVarChar(10), horaInicio);
        reqUpd.input('NombreOperador', sql.NVarChar(150), nombreOperador);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoControlEB
          SET LoginId = @LoginId,
              Fecha = @Fecha,
              Hora = @Hora,
              NombreOperador = @NombreOperador
          WHERE EncabezadoControlEBId = @EncabezadoId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(supervisorLoginId, 10) || 1);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('Hora', sql.NVarChar(10), horaInicio);
        reqIns.input('NombreOperador', sql.NVarChar(150), nombreOperador);
        reqIns.input('CreadoPor', sql.NVarChar(150), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoControlEB (LoginId, Fecha, Hora, NombreOperador, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoControlEBId
          VALUES (@LoginId, @Fecha, @Hora, @NombreOperador, @CreadoPor, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoControlEBId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoControlEBId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosControlEB (ItinerarioId, EncabezadoControlEB, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      // Upsert HoraCierreEB, CorreosEB, ComatEB, EqTransitoEB, ObservacionesEB
      const reqComp = new sql.Request(transaction);
      reqComp.input('EncabezadoId', sql.Int, targetId);
      reqComp.input('HoraCierre', sql.NVarChar(10), horaCierre);
      reqComp.input('Observaciones', sql.NVarChar(sql.MAX), obsTrimmed);
      reqComp.input('CorreosCantidad', sql.Int, parseInt(correosCantidad, 10) || 0);
      reqComp.input('ComatCantidad', sql.Int, parseInt(comatCantidad, 10) || 0);
      reqComp.input('EqTransitoCantidad', sql.Int, parseInt(eqTransitoCantidad, 10) || 0);
      reqComp.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

      await reqComp.query(`
        IF EXISTS (SELECT 1 FROM dbo.HoraCierreEB WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.HoraCierreEB SET HoraCierre = @HoraCierre WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.HoraCierreEB (EncabezadoControlEB, HoraCierre, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @HoraCierre, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.CorreosEB WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.CorreosEB SET Cantidad = @CorreosCantidad WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.CorreosEB (EncabezadoControlEB, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @CorreosCantidad, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.ComatEB WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ComatEB SET Cantidad = @ComatCantidad WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.ComatEB (EncabezadoControlEB, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @ComatCantidad, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.EqTransitoEB WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.EqTransitoEB SET Cantidad = @EqTransitoCantidad WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.EqTransitoEB (EncabezadoControlEB, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @EqTransitoCantidad, @Usuario, GETDATE(), 0);

        IF (@Observaciones <> '')
        BEGIN
          IF EXISTS (SELECT 1 FROM dbo.ObservacionesEB WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
            UPDATE dbo.ObservacionesEB SET Observaciones = @Observaciones WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
          ELSE
            INSERT INTO dbo.ObservacionesEB (EncabezadoControlEB, Observaciones, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoId, @Observaciones, @Usuario, GETDATE(), 0);
        END
        ELSE
        BEGIN
          UPDATE dbo.ObservacionesEB SET EstaEliminado = 1 WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        END
      `);

      // Soft Delete de secuencias que ya no estén activas
      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleControlEBId FROM dbo.DetalleControlEB
          WHERE EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const incomingIds = new Set(
          registrosActivos.map(r => parseInt(r.DetalleControlEBId, 10)).filter(id => Number.isFinite(id) && id > 0)
        );
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleControlEBId, 10);
          if (!incomingIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleControlEB SET EstaEliminado = 1
              WHERE DetalleControlEBId = @DetalleId AND EncabezadoControlEB = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const r of registrosActivos) {
        const detId = parseInt(r.DetalleControlEBId, 10) || 0;
        const seqNum = parseInt(r.Secuencia, 10);
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('Secuencia', sql.Int, seqNum);
        reqDet.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleControlEB
            SET Secuencia = @Secuencia
            WHERE DetalleControlEBId = @DetalleId AND EncabezadoControlEB = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...r, DetalleControlEBId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetalleControlEB (EncabezadoControlEB, Secuencia, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleControlEBId
            VALUES (@EncabezadoId, @Secuencia, @Usuario, GETDATE(), 0)
          `);
          const newId = parseInt(insDet.recordset?.[0]?.DetalleControlEBId, 10) || 0;
          detallesPersistidos.push({ ...r, DetalleControlEBId: newId });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalEquipajes: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 2. Guarda/actualiza atómicamente "Control de Equipajes en Compartimentos" (CEC)
   */
  static async guardarControlCECTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    usuarioAuditoria,
    fechaIso,
    horaInicio,
    supervisor,
    agente,
    compartimientoNo,
    compAbierto,
    compCerrado,
    equipaje = 0,
    carruajes = 0,
    correos = 0,
    carga = 0,
    cantidadConEtiqueta = 0,
    cantidadSinEtiqueta = 0,
    desembarqueInicio = '',
    desembarqueFinal = '',
    embarqueInicio = '',
    embarqueFinal = '',
    nombreOirsa = '',
    tiaOirsa = '',
    nombreCombustible = '',
    tiaCombustible = '',
    noUnidadCombustible = '',
    combustibleEntrada = '',
    combustibleSalida = '',
    nombreCocinas = '',
    tiaCocinas = '',
    noUnidadCocinas = '',
    cocinasEntrada = '',
    cocinasSalida = '',
    operadoresRampa = '',
    observaciones = '',
    cargaEmbarqueDelta = 0,
    equipajeMostrador = 0,
    equipajePuerta = 0,
    secuencias = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const obsTrimmed = String(observaciones || '').trim();
      let filasEliminadasSoft = 0;

      const secuenciasActivas = secuencias.filter(
        s => String(s.Valor || '').toUpperCase() !== 'X' && Number(s.Secuencia) > 0 && !s.EstaEliminado
      );

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoCECId
          FROM dbo.EncabezadoCEC E
          INNER JOIN dbo.ItinerariosCEC I ON E.EncabezadoCECId = I.EncabezadoCECId
          WHERE E.EncabezadoCECId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoCECId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqUpd.input('HoraInicio', sql.NVarChar(10), horaInicio);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('Supervisor', sql.NVarChar(150), supervisor);
        reqUpd.input('Agente', sql.NVarChar(150), agente);
        reqUpd.input('CompartimientoNo', sql.Int, parseInt(compartimientoNo, 10) || 1);
        reqUpd.input('CompAbierto', sql.NVarChar(10), compAbierto);
        reqUpd.input('CompCerrado', sql.NVarChar(10), compCerrado);
        reqUpd.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoCEC
          SET LoginId = @LoginId,
              HoraInicio = @HoraInicio,
              Fecha = @Fecha,
              Supervisor = @Supervisor,
              Agente = @Agente,
              CompartimientoNo = @CompartimientoNo,
              CompAbierto = @CompAbierto,
              CompCerrado = @CompCerrado,
              CreadoPor = @Usuario,
              Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqIns.input('HoraInicio', sql.NVarChar(10), horaInicio);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('Supervisor', sql.NVarChar(150), supervisor);
        reqIns.input('Agente', sql.NVarChar(150), agente);
        reqIns.input('CompartimientoNo', sql.Int, parseInt(compartimientoNo, 10) || 1);
        reqIns.input('CompAbierto', sql.NVarChar(10), compAbierto);
        reqIns.input('CompCerrado', sql.NVarChar(10), compCerrado);
        reqIns.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoCEC (
            LoginId, HoraInicio, Fecha, Supervisor, Agente, CompartimientoNo, CompAbierto, CompCerrado, CreadoPor, Creado, EstaEliminado
          )
          OUTPUT INSERTED.EncabezadoCECId
          VALUES (
            @LoginId, @HoraInicio, @Fecha, @Supervisor, @Agente, @CompartimientoNo, @CompAbierto, @CompCerrado, @Usuario, GETDATE(), 0
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoCECId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoCECId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosCEC (ItinerarioId, EncabezadoCECId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      // Upsert tablas complementarias CEC
      const reqComp = new sql.Request(transaction);
      reqComp.input('EncabezadoId', sql.Int, targetId);
      reqComp.input('Equipaje', sql.Int, parseInt(equipaje, 10) || 0);
      reqComp.input('Carruajes', sql.Int, parseInt(carruajes, 10) || 0);
      reqComp.input('Correos', sql.Int, parseInt(correos, 10) || 0);
      reqComp.input('Carga', sql.Int, parseInt(carga, 10) || 0);
      reqComp.input('CantidadConEtiqueta', sql.Int, parseInt(cantidadConEtiqueta, 10) || 0);
      reqComp.input('CantidadSinEtiqueta', sql.Int, parseInt(cantidadSinEtiqueta, 10) || 0);
      reqComp.input('DesembarqueInicio', sql.NVarChar(10), desembarqueInicio || '');
      reqComp.input('DesembarqueFinal', sql.NVarChar(10), desembarqueFinal || '');
      reqComp.input('EmbarqueInicio', sql.NVarChar(10), embarqueInicio || '');
      reqComp.input('EmbarqueFinal', sql.NVarChar(10), embarqueFinal || '');
      reqComp.input('NombreOirsa', sql.NVarChar(200), nombreOirsa || '');
      reqComp.input('TIAOirsa', sql.NVarChar(100), tiaOirsa || '');
      reqComp.input('NombreCombustible', sql.NVarChar(300), nombreCombustible || '');
      reqComp.input('TIACombustible', sql.NVarChar(150), tiaCombustible || '');
      reqComp.input('NoUnidadCombustible', sql.NVarChar(100), noUnidadCombustible || '');
      reqComp.input('CombustibleEntrada', sql.NVarChar(10), combustibleEntrada || '');
      reqComp.input('CombustibleSalida', sql.NVarChar(10), combustibleSalida || '');
      reqComp.input('NombreCocinas', sql.NVarChar(300), nombreCocinas || '');
      reqComp.input('TIACocinas', sql.NVarChar(150), tiaCocinas || '');
      reqComp.input('NoUnidadCocinas', sql.NVarChar(100), noUnidadCocinas || '');
      reqComp.input('CocinasEntrada', sql.NVarChar(10), cocinasEntrada || '');
      reqComp.input('CocinasSalida', sql.NVarChar(10), cocinasSalida || '');
      reqComp.input('OperadoresRampa', sql.NVarChar(sql.MAX), operadoresRampa || '');
      reqComp.input('Observaciones', sql.NVarChar(sql.MAX), obsTrimmed || 'N/A');
      reqComp.input('CargaEmbarqueDelta', sql.Int, parseInt(cargaEmbarqueDelta, 10) || 0);
      reqComp.input('EquipajeMostrador', sql.Int, parseInt(equipajeMostrador, 10) || 0);
      reqComp.input('EquipajePuerta', sql.Int, parseInt(equipajePuerta, 10) || 0);
      reqComp.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

      await reqComp.query(`
        IF EXISTS (SELECT 1 FROM dbo.DetalleCECRecp WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.DetalleCECRecp
          SET Equipaje = @Equipaje, Carruajes = @Carruajes, Correos = @Correos, Carga = @Carga, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.DetalleCECRecp (EncabezadoCECId, Equipaje, Carruajes, Correos, Carga, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @Equipaje, @Carruajes, @Correos, @Carga, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.EmbarqueDelta WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.EmbarqueDelta
          SET Carga = @CargaEmbarqueDelta, EquipajeMostrador = @EquipajeMostrador, EquipajePuerta = @EquipajePuerta
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE IF (@CargaEmbarqueDelta > 0 OR @EquipajeMostrador > 0 OR @EquipajePuerta > 0)
          INSERT INTO dbo.EmbarqueDelta (EncabezadoCECId, Carga, EquipajeMostrador, EquipajePuerta, EstaEliminado)
          VALUES (@EncabezadoId, @CargaEmbarqueDelta, @EquipajeMostrador, @EquipajePuerta, 0);

        IF EXISTS (SELECT 1 FROM dbo.EquipajeDaniadoCEC WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.EquipajeDaniadoCEC
          SET CantidadConEtiqueta = @CantidadConEtiqueta, CantidadSinEtiqueta = @CantidadSinEtiqueta, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.EquipajeDaniadoCEC (EncabezadoCECId, CantidadConEtiqueta, CantidadSinEtiqueta, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @CantidadConEtiqueta, @CantidadSinEtiqueta, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.DesembarqueCEC WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.DesembarqueCEC
          SET HoraInicio = @DesembarqueInicio, HoraFinal = @DesembarqueFinal, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.DesembarqueCEC (EncabezadoCECId, HoraInicio, HoraFinal, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @DesembarqueInicio, @DesembarqueFinal, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.EmbarqueCEC WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.EmbarqueCEC
          SET HoraInicio = @EmbarqueInicio, HoraFinal = @EmbarqueFinal, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.EmbarqueCEC (EncabezadoCECId, HoraInicio, HoraFinal, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @EmbarqueInicio, @EmbarqueFinal, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.PersonalPlataformaCEC WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.PersonalPlataformaCEC
          SET NombreOirsa = @NombreOirsa, TIAOirsa = @TIAOirsa,
              NombreCombustible = @NombreCombustible, TIACombustible = @TIACombustible,
              NoUnidadCombustible = @NoUnidadCombustible, CombustibleEntrada = @CombustibleEntrada, CombustibleSalida = @CombustibleSalida,
              NombreCocinas = @NombreCocinas, TIACocinas = @TIACocinas,
              NoUnidadCocinas = @NoUnidadCocinas, CocinasEntrada = @CocinasEntrada, CocinasSalida = @CocinasSalida,
              OperadoresRampa = @OperadoresRampa, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.PersonalPlataformaCEC (
            EncabezadoCECId, NombreOirsa, TIAOirsa, NombreCombustible, TIACombustible, NoUnidadCombustible,
            CombustibleEntrada, CombustibleSalida, NombreCocinas, TIACocinas, NoUnidadCocinas,
            CocinasEntrada, CocinasSalida, OperadoresRampa, CreadoPor, Creado, EstaEliminado
          )
          VALUES (
            @EncabezadoId, @NombreOirsa, @TIAOirsa, @NombreCombustible, @TIACombustible, @NoUnidadCombustible,
            @CombustibleEntrada, @CombustibleSalida, @NombreCocinas, @TIACocinas, @NoUnidadCocinas,
            @CocinasEntrada, @CocinasSalida, @OperadoresRampa, @Usuario, GETDATE(), 0
          );

        IF EXISTS (SELECT 1 FROM dbo.ObservacionesCEC WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ObservacionesCEC SET Observaciones = @Observaciones WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.ObservacionesCEC (EncabezadoCECId, Observaciones, EstaEliminado)
          VALUES (@EncabezadoId, @Observaciones, 0);
      `);

      // Soft Delete de secuencias DetalleCECDesp retiradas
      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleCECDespId FROM dbo.DetalleCECDesp
          WHERE EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const incomingIds = new Set(
          secuenciasActivas.map(s => parseInt(s.DetalleCECDespId, 10)).filter(id => Number.isFinite(id) && id > 0)
        );
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleCECDespId, 10);
          if (!incomingIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleCECDesp SET EstaEliminado = 1
              WHERE DetalleCECDespId = @DetalleId AND EncabezadoCECId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const s of secuenciasActivas) {
        const detId = parseInt(s.DetalleCECDespId, 10) || 0;
        const seqNum = parseInt(s.Secuencia, 10);
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('Secuencia', sql.Int, seqNum);
        reqDet.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleCECDesp SET Secuencia = @Secuencia
            WHERE DetalleCECDespId = @DetalleId AND EncabezadoCECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...s, DetalleCECDespId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetalleCECDesp (EncabezadoCECId, Secuencia, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleCECDespId
            VALUES (@EncabezadoId, @Secuencia, @Usuario, GETDATE(), 0)
          `);
          const newId = parseInt(insDet.recordset?.[0]?.DetalleCECDespId, 10) || 0;
          detallesPersistidos.push({ ...s, DetalleCECDespId: newId });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalEmbarque: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 3. Guarda/actualiza atómicamente "Control de Ingreso y Egreso Cabina" (CIEC)
   */
  static async guardarControlCIECTransaccional({
    encabezadoId = 0,
    itinerarioId,
    supervisorEmpleadoId,
    usuarioAuditoria,
    fechaIso,
    horaInicio,
    arriboVuelo = '',
    aeronaveAsegurada = '',
    pasarelaAcoplada = '',
    desacoplePasarela = '',
    puertaAbierta = '',
    puertaCerrada = '',
    egresoTripulacion = '',
    ingresoTripulacion = '',
    primerPax = '',
    ultimoPax = '',
    pushBack = '',
    despegue = '',
    paxEntrando = 0,
    paxAbordos = 0,
    totalEquipaje = 0,
    observacionesCombinadas = '',
    tractoristaEmpleadoId = null,
    maquinariaEquipoId = null,
    alerosIds = [],
    alerosDelta = '',
    maquinariaDelta = '',
    tractoristaDelta = '',
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoCIECId
          FROM dbo.EncabezadoCIEC E
          INNER JOIN dbo.ItinerariosCIEC I ON E.EncabezadoCIECId = I.EncabezadoCIECId
          WHERE E.EncabezadoCIECId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoCIECId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('HoraInicio', sql.NVarChar(5), horaInicio);
        reqUpd.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10));
        reqUpd.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoCIEC
          SET Fecha = @Fecha, HoraInicio = @HoraInicio, EmpleadoId = @EmpleadoId, CreadoPor = @Usuario
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('HoraInicio', sql.NVarChar(5), horaInicio);
        reqIns.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10));
        reqIns.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoCIEC (Fecha, HoraInicio, EmpleadoId, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoCIECId
          VALUES (@Fecha, @HoraInicio, @EmpleadoId, @Usuario, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoCIECId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoCIECId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('EncabezadoId', sql.Int, targetId);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosCIEC (EncabezadoCIECId, ItinerarioId, EstaEliminado)
          VALUES (@EncabezadoId, @ItinerarioId, 0)
        `);
      }

      // Upsert TiemposCIEC, TotalesCIEC, MaquinariaCIEC, ObservacionesCIEC
      const reqComp = new sql.Request(transaction);
      reqComp.input('EncabezadoId', sql.Int, targetId);
      reqComp.input('ArriboVuelo', sql.NVarChar(5), arriboVuelo || null);
      reqComp.input('AeronaveAsegurada', sql.NVarChar(5), aeronaveAsegurada || null);
      reqComp.input('PasarelaAcoplada', sql.NVarChar(5), pasarelaAcoplada || null);
      reqComp.input('DesacoplePasarela', sql.NVarChar(5), desacoplePasarela || null);
      reqComp.input('PuertaAbierta', sql.NVarChar(5), puertaAbierta || null);
      reqComp.input('PuertaCerrada', sql.NVarChar(5), puertaCerrada || null);
      reqComp.input('EgresoTripulacion', sql.NVarChar(5), egresoTripulacion || null);
      reqComp.input('IngresoTripulacion', sql.NVarChar(5), ingresoTripulacion || null);
      reqComp.input('PrimerPax', sql.NVarChar(5), primerPax || null);
      reqComp.input('UltimoPax', sql.NVarChar(5), ultimoPax || null);
      reqComp.input('PushBack', sql.NVarChar(5), pushBack || null);
      reqComp.input('Despegue', sql.NVarChar(5), despegue || null);
      reqComp.input('PaxEntrando', sql.Int, parseInt(paxEntrando, 10) || 0);
      reqComp.input('PaxAbordos', sql.Int, parseInt(paxAbordos, 10) || 0);
      reqComp.input('TotalEquipaje', sql.Int, parseInt(totalEquipaje, 10) || 0);
      reqComp.input('MaquinariaEmpleadoId', sql.Int, tractoristaEmpleadoId ? parseInt(tractoristaEmpleadoId, 10) : null);
      reqComp.input('MaquinariaEquipoId', sql.Int, maquinariaEquipoId ? parseInt(maquinariaEquipoId, 10) : null);
      reqComp.input('AlerosDelta', sql.NVarChar(sql.MAX), String(alerosDelta || '').trim());
      reqComp.input('MaquinariaDelta', sql.NVarChar(sql.MAX), String(maquinariaDelta || '').trim());
      reqComp.input('TractoristaDelta', sql.NVarChar(sql.MAX), String(tractoristaDelta || '').trim());
      reqComp.input('Observaciones', sql.NVarChar(sql.MAX), observacionesCombinadas || '');
      reqComp.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

      await reqComp.query(`
        IF EXISTS (SELECT 1 FROM dbo.TiemposCIEC WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.TiemposCIEC
          SET ArriboVuelo = @ArriboVuelo, AeronaveAsegurada = @AeronaveAsegurada, PasarelaAcoplada = @PasarelaAcoplada,
              DesacoplePasarela = @DesacoplePasarela, PuertaAbierta = @PuertaAbierta, PuertaCerrada = @PuertaCerrada,
              EgresoTripulacion = @EgresoTripulacion, IngresoTripulacion = @IngresoTripulacion,
              PrimerPax = @PrimerPax, UltimoPax = @UltimoPax, PushBack = @PushBack, Despegue = @Despegue,
              CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.TiemposCIEC (
            EncabezadoCIECId, ArriboVuelo, AeronaveAsegurada, PasarelaAcoplada, DesacoplePasarela,
            PuertaAbierta, PuertaCerrada, EgresoTripulacion, IngresoTripulacion, PrimerPax, UltimoPax,
            PushBack, Despegue, CreadoPor, Creado, EstaEliminado
          )
          VALUES (
            @EncabezadoId, @ArriboVuelo, @AeronaveAsegurada, @PasarelaAcoplada, @DesacoplePasarela,
            @PuertaAbierta, @PuertaCerrada, @EgresoTripulacion, @IngresoTripulacion, @PrimerPax, @UltimoPax,
            @PushBack, @Despegue, @Usuario, GETDATE(), 0
          );

        IF EXISTS (SELECT 1 FROM dbo.TotalesCIEC WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.TotalesCIEC
          SET PaxEntrando = @PaxEntrando, PaxAbordos = @PaxAbordos, TotalEquipaje = @TotalEquipaje,
              CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.TotalesCIEC (EncabezadoCIECId, PaxEntrando, PaxAbordos, TotalEquipaje, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @PaxEntrando, @PaxAbordos, @TotalEquipaje, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.MaquinariaCIEC WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.MaquinariaCIEC
          SET EmpleadoId = @MaquinariaEmpleadoId, MaquinariaEquipoId = @MaquinariaEquipoId, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE IF (@MaquinariaEmpleadoId IS NOT NULL OR @MaquinariaEquipoId IS NOT NULL)
          INSERT INTO dbo.MaquinariaCIEC (EncabezadoCIECId, EmpleadoId, MaquinariaEquipoId, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @MaquinariaEmpleadoId, @MaquinariaEquipoId, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.AlerosMaquinariaDeltaCIEC WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.AlerosMaquinariaDeltaCIEC
          SET Aleros = @AlerosDelta, Maquinaria = @MaquinariaDelta, Tractorista = @TractoristaDelta
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE IF (@AlerosDelta <> '' OR @MaquinariaDelta <> '' OR @TractoristaDelta <> '')
          INSERT INTO dbo.AlerosMaquinariaDeltaCIEC (EncabezadoCIECId, Aleros, Maquinaria, Tractorista, EstaEliminado)
          VALUES (@EncabezadoId, @AlerosDelta, @MaquinariaDelta, @TractoristaDelta, 0);

        IF EXISTS (SELECT 1 FROM dbo.ObservacionesCIEC WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ObservacionesCIEC
          SET Observaciones = @Observaciones, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE IF (@Observaciones <> '')
          INSERT INTO dbo.ObservacionesCIEC (EncabezadoCIECId, Observaciones, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @Observaciones, @Usuario, GETDATE(), 0);
      `);

      // Sincronizar AlerosCIEC (Soft Delete + Insert)
      const reqAlerosDel = new sql.Request(transaction);
      reqAlerosDel.input('EncabezadoId', sql.Int, targetId);
      await reqAlerosDel.query(`
        UPDATE dbo.AlerosCIEC SET EstaEliminado = 1
        WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
      `);

      for (const aleroEmpId of alerosIds) {
        const empIdNum = parseInt(aleroEmpId, 10);
        if (Number.isFinite(empIdNum) && empIdNum > 0) {
          const reqAl = new sql.Request(transaction);
          reqAl.input('EncabezadoId', sql.Int, targetId);
          reqAl.input('EmpleadoId', sql.Int, empIdNum);
          reqAl.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
          await reqAl.query(`
            INSERT INTO dbo.AlerosCIEC (EncabezadoCIECId, EmpleadoId, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoId, @EmpleadoId, @Usuario, GETDATE(), 0)
          `);
        }
      }

      // Sincronizar DetalleCIEC y SalidaCIEC (Soft Delete de filas retiradas)
      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleCIECId FROM dbo.DetalleCIEC
          WHERE EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const incomingIds = new Set(
          registros.map(r => parseInt(r.DetalleCIECId, 10)).filter(id => Number.isFinite(id) && id > 0)
        );
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleCIECId, 10);
          if (!incomingIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleCIEC SET EstaEliminado = 1 WHERE DetalleCIECId = @DetalleId AND EncabezadoCIECId = @EncabezadoId;
              UPDATE dbo.SalidaCIEC SET EstaEliminado = 1 WHERE DetalleCIECId = @DetalleId AND ISNULL(EstaEliminado, 0) = 0;
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const r of registros) {
        const detId = parseInt(r.DetalleCIECId, 10) || 0;
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('Nombre', sql.NVarChar(200), r.Nombre);
        reqDet.input('NoTIA', sql.NVarChar(50), r.NoTIA);
        reqDet.input('Empresa', sql.NVarChar(150), r.Empresa);
        reqDet.input('HoraIngreso', sql.NVarChar(5), r.HoraIngreso);
        reqDet.input('Motivo', sql.NVarChar(250), r.Motivo);
        reqDet.input('HoraSalida', sql.NVarChar(5), r.HoraSalida || null);
        reqDet.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleCIEC
            SET Nombre = @Nombre, NoTIA = @NoTIA, Empresa = @Empresa, HoraIngreso = @HoraIngreso, Motivo = @Motivo,
                CreadoPor = @Usuario, Creado = GETDATE()
            WHERE DetalleCIECId = @DetalleId AND EncabezadoCIECId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;

            IF (@HoraSalida IS NOT NULL AND @HoraSalida <> '')
            BEGIN
              IF EXISTS (SELECT 1 FROM dbo.SalidaCIEC WHERE DetalleCIECId = @DetalleId AND ISNULL(EstaEliminado, 0) = 0)
                UPDATE dbo.SalidaCIEC SET HoraSalida = @HoraSalida, CreadoPor = @Usuario, Creado = GETDATE()
                WHERE DetalleCIECId = @DetalleId AND ISNULL(EstaEliminado, 0) = 0;
              ELSE
                INSERT INTO dbo.SalidaCIEC (DetalleCIECId, HoraSalida, CreadoPor, Creado, EstaEliminado)
                VALUES (@DetalleId, @HoraSalida, @Usuario, GETDATE(), 0);
            END
          `);
          detallesPersistidos.push({ ...r, DetalleCIECId: detId });
        } else {
          const insRes = await reqDet.query(`
            INSERT INTO dbo.DetalleCIEC (EncabezadoCIECId, Nombre, NoTIA, Empresa, HoraIngreso, Motivo, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleCIECId
            VALUES (@EncabezadoId, @Nombre, @NoTIA, @Empresa, @HoraIngreso, @Motivo, @Usuario, GETDATE(), 0)
          `);
          const newDetId = parseInt(insRes.recordset?.[0]?.DetalleCIECId, 10) || 0;
          if (newDetId > 0 && r.HoraSalida) {
            const reqSal = new sql.Request(transaction);
            reqSal.input('DetalleId', sql.Int, newDetId);
            reqSal.input('HoraSalida', sql.NVarChar(5), r.HoraSalida);
            reqSal.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
            await reqSal.query(`
              INSERT INTO dbo.SalidaCIEC (DetalleCIECId, HoraSalida, CreadoPor, Creado, EstaEliminado)
              VALUES (@DetalleId, @HoraSalida, @Usuario, GETDATE(), 0)
            `);
          }
          detallesPersistidos.push({ ...r, DetalleCIECId: newDetId });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalPersonas: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 4. Guarda/actualiza atómicamente "Equipajes en mal estado y carga dañada" (EquipMECD)
   */
  static async guardarEquipMECDTransaccional({
    encabezadoId = 0,
    itinerarioId,
    supervisorId,
    agenteId,
    ccoId,
    usuarioAuditoria,
    revisiones = [],
    conFirma = [],
    sinFirma = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoEquipMECDId
          FROM dbo.EncabezadoEquipMECD E
          INNER JOIN dbo.ItinerariosEquipMECD I ON E.EncabezadoEquipMECDId = I.EncabezadoEquipMECDId
          WHERE E.EncabezadoEquipMECDId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoEquipMECDId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('SupervisorId', sql.Int, parseInt(supervisorId, 10));
        reqUpd.input('AgenteId', sql.Int, parseInt(agenteId, 10));
        reqUpd.input('CCOId', sql.Int, parseInt(ccoId, 10));
        reqUpd.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoEquipMECD
          SET SupervisorId = @SupervisorId,
              AgenteId = @AgenteId,
              EmpleadoId = @CCOId,
              CreadoPor = @Usuario,
              Creado = GETDATE()
          WHERE EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('SupervisorId', sql.Int, parseInt(supervisorId, 10));
        reqIns.input('AgenteId', sql.Int, parseInt(agenteId, 10));
        reqIns.input('CCOId', sql.Int, parseInt(ccoId, 10));
        reqIns.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoEquipMECD (SupervisorId, AgenteId, EmpleadoId, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoEquipMECDId
          VALUES (@SupervisorId, @AgenteId, @CCOId, @Usuario, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoEquipMECDId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoEquipMECDId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosEquipMECD (ItinerarioId, EncabezadoEquipMECDId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      // 1. Sincronizar RevisionEquipMECD
      if (encabezadoId > 0) {
        const reqExRev = new sql.Request(transaction);
        reqExRev.input('EncabezadoId', sql.Int, targetId);
        const exRevRes = await reqExRev.query(`
          SELECT DetalleEquipMECDId FROM dbo.RevisionEquipMECD
          WHERE EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inRevIds = new Set(revisiones.map(r => parseInt(r.DetalleEquipMECDId, 10)).filter(id => id > 0));
        for (const dbRow of exRevRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleEquipMECDId, 10);
          if (!inRevIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('Id', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`UPDATE dbo.RevisionEquipMECD SET EstaEliminado = 1 WHERE DetalleEquipMECDId = @Id AND EncabezadoEquipMECDId = @EncabezadoId`);
            filasEliminadasSoft += 1;
          }
        }
      }

      for (const r of revisiones) {
        const detId = parseInt(r.DetalleEquipMECDId, 10) || 0;
        const reqR = new sql.Request(transaction);
        reqR.input('EncabezadoId', sql.Int, targetId);
        reqR.input('Control', sql.NVarChar(100), String(r.Control));
        reqR.input('Colilla', sql.NVarChar(100), String(r.Colilla));
        reqR.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        if (detId > 0 && encabezadoId > 0) {
          reqR.input('Id', sql.Int, detId);
          await reqR.query(`
            UPDATE dbo.RevisionEquipMECD SET Control = @Control, Colilla = @Colilla
            WHERE DetalleEquipMECDId = @Id AND EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
        } else {
          await reqR.query(`
            INSERT INTO dbo.RevisionEquipMECD (EncabezadoEquipMECDId, Control, Colilla, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoId, @Control, @Colilla, @Usuario, GETDATE(), 0)
          `);
        }
      }

      // 2. Sincronizar EquipajeME (Con Firma)
      if (encabezadoId > 0) {
        const reqExME = new sql.Request(transaction);
        reqExME.input('EncabezadoId', sql.Int, targetId);
        const exMERes = await reqExME.query(`
          SELECT EquipajeMEId FROM dbo.EquipajeME
          WHERE EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inMEIds = new Set(conFirma.map(r => parseInt(r.EquipajeMEId, 10)).filter(id => id > 0));
        for (const dbRow of exMERes.recordset || []) {
          const dbId = parseInt(dbRow.EquipajeMEId, 10);
          if (!inMEIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('Id', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`UPDATE dbo.EquipajeME SET EstaEliminado = 1 WHERE EquipajeMEId = @Id AND EncabezadoEquipMECDId = @EncabezadoId`);
            filasEliminadasSoft += 1;
          }
        }
      }

      for (const r of conFirma) {
        const detId = parseInt(r.EquipajeMEId, 10) || 0;
        const reqM = new sql.Request(transaction);
        reqM.input('EncabezadoId', sql.Int, targetId);
        reqM.input('Pasajero', sql.NVarChar(200), String(r.Pasajero));
        reqM.input('Colilla', sql.NVarChar(100), String(r.Colilla));
        reqM.input('Control', sql.NVarChar(100), String(r.Control));
        reqM.input('Destino', sql.NVarChar(100), String(r.Destino));
        reqM.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        if (detId > 0 && encabezadoId > 0) {
          reqM.input('Id', sql.Int, detId);
          await reqM.query(`
            UPDATE dbo.EquipajeME SET Pasajero = @Pasajero, Colilla = @Colilla, Control = @Control, Destino = @Destino
            WHERE EquipajeMEId = @Id AND EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
        } else {
          await reqM.query(`
            INSERT INTO dbo.EquipajeME (EncabezadoEquipMECDId, Pasajero, Colilla, Control, Destino, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoId, @Pasajero, @Colilla, @Control, @Destino, @Usuario, GETDATE(), 0)
          `);
        }
      }

      // 3. Sincronizar EquipajeDT (Dañada en Tobogán Sin Firma)
      if (encabezadoId > 0) {
        const reqExDT = new sql.Request(transaction);
        reqExDT.input('EncabezadoId', sql.Int, targetId);
        const exDTRes = await reqExDT.query(`
          SELECT EquipajeDTId FROM dbo.EquipajeDT
          WHERE EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inDTIds = new Set(sinFirma.map(r => parseInt(r.EquipajeDTId, 10)).filter(id => id > 0));
        for (const dbRow of exDTRes.recordset || []) {
          const dbId = parseInt(dbRow.EquipajeDTId, 10);
          if (!inDTIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('Id', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`UPDATE dbo.EquipajeDT SET EstaEliminado = 1 WHERE EquipajeDTId = @Id AND EncabezadoEquipMECDId = @EncabezadoId`);
            filasEliminadasSoft += 1;
          }
        }
      }

      for (const r of sinFirma) {
        const detId = parseInt(r.EquipajeDTId, 10) || 0;
        const reqD = new sql.Request(transaction);
        reqD.input('EncabezadoId', sql.Int, targetId);
        reqD.input('Pasajero', sql.NVarChar(200), String(r.Pasajero));
        reqD.input('Colilla', sql.NVarChar(100), String(r.Colilla));
        reqD.input('Control', sql.NVarChar(100), String(r.Control));
        reqD.input('Destino', sql.NVarChar(100), String(r.Destino));
        reqD.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        if (detId > 0 && encabezadoId > 0) {
          reqD.input('Id', sql.Int, detId);
          await reqD.query(`
            UPDATE dbo.EquipajeDT SET Pasajero = @Pasajero, Colilla = @Colilla, Control = @Control, Destino = @Destino
            WHERE EquipajeDTId = @Id AND EncabezadoEquipMECDId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
        } else {
          await reqD.query(`
            INSERT INTO dbo.EquipajeDT (EncabezadoEquipMECDId, Pasajero, Colilla, Control, Destino, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoId, @Pasajero, @Colilla, @Control, @Destino, @Usuario, GETDATE(), 0)
          `);
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalRegistros: revisiones.length + conFirma.length + sinFirma.length,
        filasEliminadasSoft
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 5. Guarda/actualiza atómicamente "Puestos por Operación" (PO)
   */
  static async guardarPuestosOperacionTransaccional({
    encabezadoId = 0,
    itinerarioId,
    supervisorLoginId,
    usuarioAuditoria,
    observaciones = '',
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const obsTrimmed = String(observaciones || '').trim();
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoPOId
          FROM dbo.EncabezadoPO E
          INNER JOIN dbo.ItinerariosPO I ON E.EncabezadoPOId = I.EncabezadoPOId
          WHERE E.EncabezadoPOId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoPOId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(supervisorLoginId, 10));
        reqUpd.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoPO
          SET LoginId = @LoginId, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoPOId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(supervisorLoginId, 10));
        reqIns.input('Usuario', sql.NVarChar(150), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoPO (LoginId, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoPOId
          VALUES (@LoginId, @Usuario, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoPOId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoPOId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosPO (ItinerarioId, EncabezadoPOId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      // Upsert ObservacionesPO
      const reqObs = new sql.Request(transaction);
      reqObs.input('EncabezadoId', sql.Int, targetId);
      reqObs.input('Observaciones', sql.NVarChar(sql.MAX), obsTrimmed);
      await reqObs.query(`
        IF EXISTS (SELECT 1 FROM dbo.ObservacionesPO WHERE EncabezadoPOId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ObservacionesPO SET Observaciones = @Observaciones
          WHERE EncabezadoPOId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE IF (@Observaciones <> '')
          INSERT INTO dbo.ObservacionesPO (EncabezadoPOId, Observaciones, EstaEliminado)
          VALUES (@EncabezadoId, @Observaciones, 0);
      `);

      // Soft Delete de filas DetallePO retiradas
      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetallePOId FROM dbo.DetallePO
          WHERE EncabezadoPOId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inIds = new Set(registros.map(r => parseInt(r.DetallePOId, 10)).filter(id => id > 0));
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetallePOId, 10);
          if (!inIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetallePO SET EstaEliminado = 1
              WHERE DetallePOId = @DetalleId AND EncabezadoPOId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const r of registros) {
        const detId = parseInt(r.DetallePOId, 10) || 0;
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('EmpleadoId', sql.Int, parseInt(r.EmpleadoId, 10));
        reqDet.input('PosicionesPOId', sql.Int, parseInt(r.PosicionesPOId, 10));
        reqDet.input('Usuario', sql.NVarChar(150), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetallePO
            SET EmpleadoId = @EmpleadoId, PosicionesPOId = @PosicionesPOId
            WHERE DetallePOId = @DetalleId AND EncabezadoPOId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...r, DetallePOId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetallePO (EncabezadoPOId, EmpleadoId, PosicionesPOId, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetallePOId
            VALUES (@EncabezadoId, @EmpleadoId, @PosicionesPOId, @Usuario, GETDATE(), 0)
          `);
          const newId = parseInt(insDet.recordset?.[0]?.DetallePOId, 10) || 0;
          detallesPersistidos.push({ ...r, DetallePOId: newId });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalAgentes: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 6. Guarda/actualiza atómicamente "Control de Flejes en Rayos X" (CFR - ARAJET)
   */
  static async guardarControlCFRTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    supervisorEmpleadoId,
    usuarioAuditoria,
    fechaIso,
    primeraPlataforma = '',
    ultimaPlataforma = '',
    inicioOperacion = '',
    horaCierre = '',
    aviCantidad = 0,
    comatCantidad = 0,
    totalEqEncabezado = 0,
    carretas = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const totalEqCalc = carretas.reduce((acc, c) => acc + (parseInt(c.TotalEqDetalle ?? c.TotalEq, 10) || 0), 0) || (parseInt(totalEqEncabezado, 10) || 0);
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoCFRId
          FROM dbo.EncabezadoCFR E
          INNER JOIN dbo.ItinerariosCFR I ON E.EncabezadoCFRId = I.EncabezadoCFRId
          WHERE E.EncabezadoCFRId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoCFRId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqUpd.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10) || 1);
        reqUpd.input('PrimeraPlataforma', sql.NVarChar(10), String(primeraPlataforma || '').substring(0, 10));
        reqUpd.input('UltimaPlataforma', sql.NVarChar(10), String(ultimaPlataforma || '').substring(0, 10));
        reqUpd.input('InicioOperacion', sql.NVarChar(10), String(inicioOperacion || '').substring(0, 10));
        reqUpd.input('TotalEq', sql.Int, totalEqCalc);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoCFR
          SET [LoginId] = @LoginId,
              [EmpleadoId] = @EmpleadoId,
              [PrimeraPlataforma] = @PrimeraPlataforma,
              [UltimaPlataforma] = @UltimaPlataforma,
              [InicioOperacion] = @InicioOperacion,
              [Total Eq] = @TotalEq,
              [Fecha] = @Fecha
          WHERE EncabezadoCFRId = @EncabezadoId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqIns.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10) || 1);
        reqIns.input('PrimeraPlataforma', sql.NVarChar(10), String(primeraPlataforma || '').substring(0, 10));
        reqIns.input('UltimaPlataforma', sql.NVarChar(10), String(ultimaPlataforma || '').substring(0, 10));
        reqIns.input('InicioOperacion', sql.NVarChar(10), String(inicioOperacion || '').substring(0, 10));
        reqIns.input('TotalEq', sql.Int, totalEqCalc);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoCFR
            ([LoginId], [EmpleadoId], [PrimeraPlataforma], [UltimaPlataforma], [InicioOperacion], [Total Eq], [Fecha], [CreadoPor], [Creado], [EstaEliminado])
          OUTPUT INSERTED.EncabezadoCFRId
          VALUES
            (@LoginId, @EmpleadoId, @PrimeraPlataforma, @UltimaPlataforma, @InicioOperacion, @TotalEq, @Fecha, @CreadoPor, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoCFRId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoCFRId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosCFR (ItinerarioId, EncabezadoCFRId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      // Upsert CierreCFR, AviCFR y ComatCFR
      const reqComp = new sql.Request(transaction);
      reqComp.input('EncabezadoId', sql.Int, targetId);
      reqComp.input('HoraCierre', sql.NVarChar(10), String(horaCierre || '').substring(0, 10));
      reqComp.input('AviCantidad', sql.Int, parseInt(aviCantidad, 10) || 0);
      reqComp.input('ComatCantidad', sql.Int, parseInt(comatCantidad, 10) || 0);
      reqComp.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
      await reqComp.query(`
        IF EXISTS (SELECT 1 FROM dbo.CierreCFR WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.CierreCFR SET HoraCierre = @HoraCierre WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.CierreCFR (EncabezadoCFRId, HoraCierre, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @HoraCierre, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.AviCFR WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.AviCFR SET Cantidad = @AviCantidad WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.AviCFR (EncabezadoCFRId, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @AviCantidad, @Usuario, GETDATE(), 0);

        IF EXISTS (SELECT 1 FROM dbo.ComatCFR WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ComatCFR SET Cantidad = @ComatCantidad WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.ComatCFR (EncabezadoCFRId, Cantidad, CreadoPor, Creado, EstaEliminado)
          VALUES (@EncabezadoId, @ComatCantidad, @Usuario, GETDATE(), 0);
      `);

      // Soft Delete de filas DetalleCFR retiradas
      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleCFRId FROM dbo.DetalleCFR
          WHERE EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inIds = new Set(
          carretas.map(c => parseInt(c.DetalleCFRId, 10)).filter(id => Number.isFinite(id) && id > 0)
        );
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleCFRId, 10);
          if (!inIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleCFR SET EstaEliminado = 1
              WHERE DetalleCFRId = @DetalleId AND EncabezadoCFRId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const c of carretas) {
        const detId = parseInt(c.DetalleCFRId, 10) || 0;
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('CarretaId', sql.Int, parseInt(c.CarretaId, 10));
        reqDet.input('FlejeUno', sql.NVarChar(sql.MAX), String(c.FlejeUno || '').trim());
        reqDet.input('FlejeDos', sql.NVarChar(sql.MAX), String(c.FlejeDos || '').trim());
        reqDet.input('MaquinariaEquipoId', sql.Int, parseInt(c.MaquinariaEquipoId, 10));
        reqDet.input('TotalEq', sql.NVarChar(sql.MAX), String(parseInt(c.TotalEqDetalle ?? c.TotalEq, 10) || 0));
        reqDet.input('EmpleadoId', sql.Int, parseInt(c.EmpleadoId, 10));
        reqDet.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleCFR
            SET CarretaId = @CarretaId,
                FlejeUno = @FlejeUno,
                FlejeDos = @FlejeDos,
                MaquinariaEquipoId = @MaquinariaEquipoId,
                TotalEq = @TotalEq,
                EmpleadoId = @EmpleadoId
            WHERE DetalleCFRId = @DetalleId AND EncabezadoCFRId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...c, DetalleCFRId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetalleCFR
              (EncabezadoCFRId, CarretaId, FlejeUno, FlejeDos, MaquinariaEquipoId, TotalEq, EmpleadoId, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleCFRId
            VALUES
              (@EncabezadoId, @CarretaId, @FlejeUno, @FlejeDos, @MaquinariaEquipoId, @TotalEq, @EmpleadoId, @Usuario, GETDATE(), 0)
          `);
          const newId = parseInt(insDet.recordset?.[0]?.DetalleCFRId, 10) || 0;
          detallesPersistidos.push({ ...c, DetalleCFRId: newId });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalCarretas: detallesPersistidos.length,
        totalEqEncabezado: totalEqCalc,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 7. Consulta completa de "Control de Equipajes en Rayos X" (dl-rx - DELTA)
   */
  static async consultarTodoDRayosX(encabezadoId, itinerarioId) {
    const encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;

    let targetEncId = encId;
    if (targetEncId <= 0 && itiId > 0) {
      const findRes = await executeQuery(`
        SELECT TOP 1 e.EncabezadoDRayosXId
        FROM dbo.EncabezadoDRayosX e
        INNER JOIN dbo.ItinerariosDRayosX i ON e.EncabezadoDRayosXId = i.EncabezadoDRayosXId
        WHERE i.ItinerarioId = @ItinerarioId
          AND ISNULL(e.EstaEliminado, 0) = 0
          AND ISNULL(i.EstaEliminado, 0) = 0
        ORDER BY e.EncabezadoDRayosXId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      targetEncId = parseInt(findRes.recordset?.[0]?.EncabezadoDRayosXId, 10) || 0;
    }

    if (targetEncId <= 0) {
      return { encabezado: null, personalSAG: [], personalLaats: [] };
    }

    const [encRes, sagRes, laatsRes] = await Promise.all([
      executeQuery(`
        SELECT TOP 1
          e.EncabezadoDRayosXId,
          e.Fecha,
          e.LoginId,
          e.EmpleadoId,
          o.ObservacionDRayosXId,
          o.Observacion,
          t.TiemposDRayosXId,
          t.PEquipajeRecibidoRX,
          t.PCarretaEnviada,
          t.UEquipajeRX,
          t.UCarretaEnviada
        FROM dbo.EncabezadoDRayosX e
        LEFT JOIN dbo.ObservacionDRayosX o
          ON o.EncabezadoDRayosXId = e.EncabezadoDRayosXId AND ISNULL(o.EstaEliminado, 0) = 0
        LEFT JOIN dbo.TiemposDRayosX t
          ON t.EncabezadoDRayosXId = e.EncabezadoDRayosXId AND ISNULL(t.EstaEliminado, 0) = 0
        WHERE e.EncabezadoDRayosXId = @EncabezadoId
          AND ISNULL(e.EstaEliminado, 0) = 0
      `, [{ name: 'EncabezadoId', type: sql.Int, value: targetEncId }]),
      executeQuery(`
        SELECT PersonalSAGId, Nombre, Id
        FROM dbo.PersonalSAG
        WHERE EncabezadoDRayosXId = @EncabezadoId
          AND ISNULL(EstaEliminado, 0) = 0
        ORDER BY PersonalSAGId ASC
      `, [{ name: 'EncabezadoId', type: sql.Int, value: targetEncId }]),
      executeQuery(`
        SELECT PersonalLaatsId, EmpleadoId, Id
        FROM dbo.PersonalLaats
        WHERE EncabezadoDRayosXId = @EncabezadoId
          AND ISNULL(EstaEliminado, 0) = 0
        ORDER BY PersonalLaatsId ASC
      `, [{ name: 'EncabezadoId', type: sql.Int, value: targetEncId }])
    ]);

    const rawEnc = encRes.recordset?.[0] || null;
    if (rawEnc) {
      let rawObs = String(rawEnc.Observacion || '');
      let horaInicio = '';
      let pCarretaFull = String(rawEnc.PCarretaEnviada || '').trim();
      let uEquipajeFull = String(rawEnc.UEquipajeRX || '').trim();

      const metaMatch = rawObs.match(/\s*\[RX_META:(\{.*?\})\]\s*$/);
      if (metaMatch) {
        try {
          const metaObj = JSON.parse(metaMatch[1]);
          if (metaObj.hi) horaInicio = String(metaObj.hi);
          if (metaObj.pc) pCarretaFull = String(metaObj.pc);
          if (metaObj.ue) uEquipajeFull = String(metaObj.ue);
        } catch (_) {}
        rawObs = rawObs.replace(/\s*\[RX_META:\{.*?\}\]\s*$/, '').trim();
      }

      rawEnc.Observacion = rawObs;
      rawEnc.HoraInicio = horaInicio;
      rawEnc.PCarretaEnviada = pCarretaFull;
      rawEnc.UEquipajeRX = uEquipajeFull;
    }

    return {
      encabezado: rawEnc,
      personalSAG: sagRes.recordset || [],
      personalLaats: laatsRes.recordset || []
    };
  }

  /**
   * 7b. Guarda/actualiza atómicamente "Control de Equipajes en Rayos X" (dl-rx - DELTA)
   */
  static async guardarControlRXTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    supervisorEmpleadoId,
    fechaIso,
    horaInicio = '',
    pEquipajeRecibidoRX = '',
    pCarretaEnviada = '',
    uEquipajeRX = '',
    uCarretaEnviada = '',
    observaciones = '',
    personalSAG = [],
    personalLaats = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const obsClean = String(observaciones || '').replace(/\s*\[RX_META:\{.*?\}\]\s*$/, '').trim();
      const metaPayload = JSON.stringify({
        hi: String(horaInicio || '').trim(),
        pc: String(pCarretaEnviada || '').trim(),
        ue: String(uEquipajeRX || '').trim()
      });
      const obsConMeta = `${obsClean} [RX_META:${metaPayload}]`.trim();

      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoDRayosXId
          FROM dbo.EncabezadoDRayosX E
          INNER JOIN dbo.ItinerariosDRayosX I ON E.EncabezadoDRayosXId = I.EncabezadoDRayosXId
          WHERE E.EncabezadoDRayosXId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoDRayosXId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqUpd.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10) || 1);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoDRayosX
          SET Fecha = @Fecha, LoginId = @LoginId, EmpleadoId = @EmpleadoId
          WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqIns.input('EmpleadoId', sql.Int, parseInt(supervisorEmpleadoId, 10) || 1);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoDRayosX (Fecha, LoginId, EmpleadoId, EstaEliminado)
          OUTPUT INSERTED.EncabezadoDRayosXId
          VALUES (@Fecha, @LoginId, @EmpleadoId, 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoDRayosXId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoDRayosXId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('EncabezadoId', sql.Int, targetId);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosDRayosX (EncabezadoDRayosXId, ItinerarioId, EstaEliminado)
          VALUES (@EncabezadoId, @ItinerarioId, 0)
        `);
      }

      // Upsert ObservacionDRayosX y TiemposDRayosX (respetando longitud real en SIO: NVARCHAR(1) en PCarretaEnviada/UEquipajeRX y NVARCHAR(5) en PEquipajeRecibidoRX/UCarretaEnviada; el valor completo se conserva en RX_META)
      const reqComp = new sql.Request(transaction);
      reqComp.input('EncabezadoId', sql.Int, targetId);
      reqComp.input('Observacion', sql.NVarChar(sql.MAX), obsConMeta);
      reqComp.input('PEquipajeRecibidoRX', sql.NVarChar(5), String(pEquipajeRecibidoRX || '').substring(0, 5));
      reqComp.input('PCarretaEnviada', sql.NVarChar(1), String(pCarretaEnviada || '').substring(0, 1));
      reqComp.input('UEquipajeRX', sql.NVarChar(1), String(uEquipajeRX || '').substring(0, 1));
      reqComp.input('UCarretaEnviada', sql.NVarChar(5), String(uCarretaEnviada || '').substring(0, 5));
      await reqComp.query(`
        IF EXISTS (SELECT 1 FROM dbo.ObservacionDRayosX WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.ObservacionDRayosX SET Observacion = @Observacion
          WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.ObservacionDRayosX (EncabezadoDRayosXId, Observacion, EstaEliminado)
          VALUES (@EncabezadoId, @Observacion, 0);

        IF EXISTS (SELECT 1 FROM dbo.TiemposDRayosX WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0)
          UPDATE dbo.TiemposDRayosX
          SET PEquipajeRecibidoRX = @PEquipajeRecibidoRX,
              PCarretaEnviada = @PCarretaEnviada,
              UEquipajeRX = @UEquipajeRX,
              UCarretaEnviada = @UCarretaEnviada
          WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0;
        ELSE
          INSERT INTO dbo.TiemposDRayosX (EncabezadoDRayosXId, PEquipajeRecibidoRX, PCarretaEnviada, UEquipajeRX, UCarretaEnviada, EstaEliminado)
          VALUES (@EncabezadoId, @PEquipajeRecibidoRX, @PCarretaEnviada, @UEquipajeRX, @UCarretaEnviada, 0);
      `);

      // Soft Delete + Upsert PersonalSAG
      if (encabezadoId > 0) {
        const reqExSag = new sql.Request(transaction);
        reqExSag.input('EncabezadoId', sql.Int, targetId);
        const exSagRes = await reqExSag.query(`
          SELECT PersonalSAGId FROM dbo.PersonalSAG
          WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inSagIds = new Set(personalSAG.map(s => parseInt(s.PersonalSAGId, 10)).filter(id => id > 0));
        for (const dbRow of exSagRes.recordset || []) {
          const dbId = parseInt(dbRow.PersonalSAGId, 10);
          if (!inSagIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('PersonalSAGId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.PersonalSAG SET EstaEliminado = 1
              WHERE PersonalSAGId = @PersonalSAGId AND EncabezadoDRayosXId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const sagPersistidos = [];
      for (const s of personalSAG) {
        const sagId = parseInt(s.PersonalSAGId, 10) || 0;
        const reqS = new sql.Request(transaction);
        reqS.input('EncabezadoId', sql.Int, targetId);
        reqS.input('Nombre', sql.NVarChar(sql.MAX), String(s.Nombre || '').trim());
        reqS.input('Id', sql.NVarChar(sql.MAX), String(s.Id || '').trim());
        if (sagId > 0 && encabezadoId > 0) {
          reqS.input('PersonalSAGId', sql.Int, sagId);
          await reqS.query(`
            UPDATE dbo.PersonalSAG SET Nombre = @Nombre, Id = @Id
            WHERE PersonalSAGId = @PersonalSAGId AND EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          sagPersistidos.push({ ...s, PersonalSAGId: sagId });
        } else {
          const insS = await reqS.query(`
            INSERT INTO dbo.PersonalSAG (EncabezadoDRayosXId, Nombre, Id, EstaEliminado)
            OUTPUT INSERTED.PersonalSAGId
            VALUES (@EncabezadoId, @Nombre, @Id, 0)
          `);
          sagPersistidos.push({ ...s, PersonalSAGId: parseInt(insS.recordset?.[0]?.PersonalSAGId, 10) || 0 });
        }
      }

      // Soft Delete + Upsert PersonalLaats
      if (encabezadoId > 0) {
        const reqExLaats = new sql.Request(transaction);
        reqExLaats.input('EncabezadoId', sql.Int, targetId);
        const exLaatsRes = await reqExLaats.query(`
          SELECT PersonalLaatsId FROM dbo.PersonalLaats
          WHERE EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inLaatsIds = new Set(personalLaats.map(l => parseInt(l.PersonalLaatsId, 10)).filter(id => id > 0));
        for (const dbRow of exLaatsRes.recordset || []) {
          const dbId = parseInt(dbRow.PersonalLaatsId, 10);
          if (!inLaatsIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('PersonalLaatsId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.PersonalLaats SET EstaEliminado = 1
              WHERE PersonalLaatsId = @PersonalLaatsId AND EncabezadoDRayosXId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const laatsPersistidos = [];
      for (const l of personalLaats) {
        const laatsId = parseInt(l.PersonalLaatsId, 10) || 0;
        const reqL = new sql.Request(transaction);
        reqL.input('EncabezadoId', sql.Int, targetId);
        reqL.input('EmpleadoId', sql.Int, parseInt(l.EmpleadoId, 10));
        reqL.input('Id', sql.NVarChar(sql.MAX), String(l.Id || '').trim());
        if (laatsId > 0 && encabezadoId > 0) {
          reqL.input('PersonalLaatsId', sql.Int, laatsId);
          await reqL.query(`
            UPDATE dbo.PersonalLaats SET EmpleadoId = @EmpleadoId, Id = @Id
            WHERE PersonalLaatsId = @PersonalLaatsId AND EncabezadoDRayosXId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          laatsPersistidos.push({ ...l, PersonalLaatsId: laatsId });
        } else {
          const insL = await reqL.query(`
            INSERT INTO dbo.PersonalLaats (EncabezadoDRayosXId, EmpleadoId, Id, EstaEliminado)
            OUTPUT INSERTED.PersonalLaatsId
            VALUES (@EncabezadoId, @EmpleadoId, @Id, 0)
          `);
          laatsPersistidos.push({ ...l, PersonalLaatsId: parseInt(insL.recordset?.[0]?.PersonalLaatsId, 10) || 0 });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalSAG: sagPersistidos.length,
        totalLaats: laatsPersistidos.length,
        filasEliminadasSoft,
        personalSAG: sagPersistidos,
        personalLaats: laatsPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 8. Guarda/actualiza atómicamente "Cargo Loading Log" (dl-cll - DELTA)
   */
  static async guardarControlCLLTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    usuarioAuditoria,
    fechaIso,
    agenteDelta = '',
    agenteSeguridad = '',
    agenteTIA = '',
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoCLLId
          FROM dbo.EncabezadoCLL E
          INNER JOIN dbo.ItinerariosCLL I ON E.EncabezadoCLLId = I.EncabezadoCLLId
          WHERE E.EncabezadoCLLId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoCLLId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqUpd.input('AgenteDelta', sql.NVarChar(sql.MAX), String(agenteDelta || '').trim());
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('AgenteSeguridad', sql.NVarChar(sql.MAX), String(agenteSeguridad || '').trim());
        reqUpd.input('AgenteTIA', sql.NVarChar(sql.MAX), String(agenteTIA || '').trim());
        reqUpd.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoCLL
          SET LoginId = @LoginId,
              AgenteDelta = @AgenteDelta,
              Fecha = @Fecha,
              AgenteSeguridad = @AgenteSeguridad,
              AgenteTIA = @AgenteTIA,
              CreadoPor = @Usuario,
              Creado = GETDATE()
          WHERE EncabezadoCLLId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqIns.input('AgenteDelta', sql.NVarChar(sql.MAX), String(agenteDelta || '').trim());
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('AgenteSeguridad', sql.NVarChar(sql.MAX), String(agenteSeguridad || '').trim());
        reqIns.input('AgenteTIA', sql.NVarChar(sql.MAX), String(agenteTIA || '').trim());
        reqIns.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoCLL (LoginId, AgenteDelta, Fecha, AgenteSeguridad, AgenteTIA, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoCLLId
          VALUES (@LoginId, @AgenteDelta, @Fecha, @AgenteSeguridad, @AgenteTIA, @Usuario, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoCLLId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoCLLId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosCLL (ItinerarioId, EncabezadoCLLId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleCLLId FROM dbo.DetalleCLL
          WHERE EncabezadoCLLId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inIds = new Set(registros.map(r => parseInt(r.DetalleCLLId, 10)).filter(id => id > 0));
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleCLLId, 10);
          if (!inIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleCLL SET EstaEliminado = 1
              WHERE DetalleCLLId = @DetalleId AND EncabezadoCLLId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const r of registros) {
        const detId = parseInt(r.DetalleCLLId, 10) || 0;
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('Guia', sql.NVarChar(sql.MAX), String(r.Guia || '').trim());
        reqDet.input('Contenido', sql.NVarChar(sql.MAX), String(r.Contenido || '').trim());
        reqDet.input('Piezas', sql.Int, parseInt(r.Piezas, 10) || 0);
        reqDet.input('BIN', sql.NVarChar(sql.MAX), String(r.BIN || '').trim());
        reqDet.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleCLL
            SET Guia = @Guia, Contenido = @Contenido, Piezas = @Piezas, [BIN] = @BIN, CreadoPor = @Usuario, Creado = GETDATE()
            WHERE DetalleCLLId = @DetalleId AND EncabezadoCLLId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...r, DetalleCLLId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetalleCLL (EncabezadoCLLId, Guia, Contenido, Piezas, [BIN], CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleCLLId
            VALUES (@EncabezadoId, @Guia, @Contenido, @Piezas, @BIN, @Usuario, GETDATE(), 0)
          `);
          detallesPersistidos.push({ ...r, DetalleCLLId: parseInt(insDet.recordset?.[0]?.DetalleCLLId, 10) || 0 });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalRegistros: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 9. Guarda/actualiza atómicamente "Selected Passenger" (dl-sp - DELTA)
   */
  static async guardarControlSPTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    usuarioAuditoria,
    fechaIso,
    registros = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      let filasEliminadasSoft = 0;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoSPId
          FROM dbo.EncabezadoSP E
          INNER JOIN dbo.ItinerariosSP I ON E.EncabezadoSPId = I.EncabezadoSPId
          WHERE E.EncabezadoSPId = @EncabezadoId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoSPId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoSP
          SET LoginId = @LoginId, Fecha = @Fecha, CreadoPor = @Usuario, Creado = GETDATE()
          WHERE EncabezadoSPId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoSP (LoginId, Fecha, CreadoPor, Creado, EstaEliminado)
          OUTPUT INSERTED.EncabezadoSPId
          VALUES (@LoginId, @Fecha, @Usuario, GETDATE(), 0)
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoSPId, 10) || 0;
        if (targetId <= 0) {
          throw new Error('No se pudo generar EncabezadoSPId en Azure SQL.');
        }

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, parseInt(itinerarioId, 10));
        reqIti.input('EncabezadoId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosSP (ItinerarioId, EncabezadoSPId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoId, 0)
        `);
      }

      if (encabezadoId > 0) {
        const reqExist = new sql.Request(transaction);
        reqExist.input('EncabezadoId', sql.Int, targetId);
        const existRes = await reqExist.query(`
          SELECT DetalleSPId FROM dbo.DetalleSP
          WHERE EncabezadoSPId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
        `);
        const inIds = new Set(registros.map(r => parseInt(r.DetalleSPId, 10)).filter(id => id > 0));
        for (const dbRow of existRes.recordset || []) {
          const dbId = parseInt(dbRow.DetalleSPId, 10);
          if (!inIds.has(dbId)) {
            const reqSD = new sql.Request(transaction);
            reqSD.input('DetalleId', sql.Int, dbId);
            reqSD.input('EncabezadoId', sql.Int, targetId);
            await reqSD.query(`
              UPDATE dbo.DetalleSP SET EstaEliminado = 1
              WHERE DetalleSPId = @DetalleId AND EncabezadoSPId = @EncabezadoId
            `);
            filasEliminadasSoft += 1;
          }
        }
      }

      const detallesPersistidos = [];
      for (const r of registros) {
        const detId = parseInt(r.DetalleSPId, 10) || 0;
        const reqDet = new sql.Request(transaction);
        reqDet.input('EncabezadoId', sql.Int, targetId);
        reqDet.input('Apellido', sql.NVarChar(sql.MAX), String(r.Apellido || '').trim());
        reqDet.input('Nombre', sql.NVarChar(sql.MAX), String(r.Nombre || '').trim());
        reqDet.input('SeleccionSPId', sql.Int, parseInt(r.SeleccionSPId, 10) || 1);
        reqDet.input('Asiento', sql.NVarChar(sql.MAX), String(r.Asiento || '').trim());
        reqDet.input('BCN', sql.Int, parseInt(r.BCN, 10) || 0);
        reqDet.input('NombreAgente', sql.NVarChar(sql.MAX), String(r.NombreAgente || '').trim());
        reqDet.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

        if (detId > 0 && encabezadoId > 0) {
          reqDet.input('DetalleId', sql.Int, detId);
          await reqDet.query(`
            UPDATE dbo.DetalleSP
            SET Apellido = @Apellido,
                Nombre = @Nombre,
                SeleccionSPId = @SeleccionSPId,
                Asiento = @Asiento,
                BCN = @BCN,
                NombreAgente = @NombreAgente,
                CreadoPor = @Usuario,
                Creado = GETDATE()
            WHERE DetalleSPId = @DetalleId AND EncabezadoSPId = @EncabezadoId AND ISNULL(EstaEliminado, 0) = 0
          `);
          detallesPersistidos.push({ ...r, DetalleSPId: detId });
        } else {
          const insDet = await reqDet.query(`
            INSERT INTO dbo.DetalleSP (EncabezadoSPId, Apellido, Nombre, SeleccionSPId, Asiento, BCN, NombreAgente, CreadoPor, Creado, EstaEliminado)
            OUTPUT INSERTED.DetalleSPId
            VALUES (@EncabezadoId, @Apellido, @Nombre, @SeleccionSPId, @Asiento, @BCN, @NombreAgente, @Usuario, GETDATE(), 0)
          `);
          detallesPersistidos.push({ ...r, DetalleSPId: parseInt(insDet.recordset?.[0]?.DetalleSPId, 10) || 0 });
        }
      }

      await transaction.commit();
      return {
        encabezadoId: targetId,
        totalPasajeros: detallesPersistidos.length,
        filasEliminadasSoft,
        detalles: detallesPersistidos
      };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 10. Consulta y guarda/actualiza atómicamente "Daily Activity Log" (dl-dal - DELTA)
   */
  static async consultarDetalleDAL(encabezadoId, itinerarioId) {
    const encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;
    if (encId > 0) {
      const res = await executeQuery(`
        SELECT TOP 1 *
        FROM dbo.DetalleDAL
        WHERE DetalleDALId = @DetalleDALId
          AND ItinerarioId = @ItinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
      `, [
        { name: 'DetalleDALId', type: sql.Int, value: encId },
        { name: 'ItinerarioId', type: sql.Int, value: itiId }
      ]);
      if (res.recordset?.[0]) return res.recordset[0];
    }
    if (itiId > 0) {
      const res = await executeQuery(`
        SELECT TOP 1 *
        FROM dbo.DetalleDAL
        WHERE ItinerarioId = @ItinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
        ORDER BY DetalleDALId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      return res.recordset?.[0] || null;
    }
    return null;
  }

  static async guardarControlDALTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    usuarioAuditoria,
    revisadoXRay = false,
    cantidadEqFisicos = 0,
    evaluadores = '',
    bolsasIngresadas = false,
    cantidadEq = 0,
    nombreGuardia = '',
    cantidadEqGuardia = 0,
    cantidadMaletas = 0,
    nombreGuardia2 = '',
    cantidadPiezasManifiesto = 0,
    nombreGuardia3 = '',
    nombreAgentes = '',
    nombreGuardiaEscolta = '',
    cantidadPasajerosTransito = 0,
    cantidadPasajerosSalientes = 0,
    pasajerosPerdieronVuelo = '',
    cantidadPiezasAceptadas = 0,
    cantidadPiezasCargadas = 0,
    cantidadEqFacturados = 0,
    cantidadEqCargadas = 0,
    cantidadEqRetirados = 0,
    eqCoincidePasajero = false,
    nombreAgenteDelta = ''
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('DetalleDALId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 DetalleDALId
          FROM dbo.DetalleDAL
          WHERE DetalleDALId = @DetalleDALId
            AND ItinerarioId = @ItinerarioId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El DetalleDALId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }
      }

      const req = new sql.Request(transaction);
      req.input('DetalleDALId', sql.Int, targetId);
      req.input('ItinerarioId', sql.Int, itiIdNum);
      req.input('RevisadoXRay', sql.Bit, Boolean(revisadoXRay));
      req.input('CantidadEqFisicos', sql.Int, parseInt(cantidadEqFisicos, 10) || 0);
      req.input('Evaluadores', sql.NVarChar(sql.MAX), String(evaluadores || '').trim());
      req.input('BolsasIngresadas', sql.Bit, Boolean(bolsasIngresadas));
      req.input('CantidadEq', sql.Int, parseInt(cantidadEq, 10) || 0);
      req.input('NombreGuardia', sql.NVarChar(sql.MAX), String(nombreGuardia || '').trim());
      req.input('CantidadEqGuardia', sql.Int, parseInt(cantidadEqGuardia, 10) || 0);
      req.input('CantidadMaletas', sql.Int, parseInt(cantidadMaletas, 10) || 0);
      req.input('NombreGuardia2', sql.NVarChar(sql.MAX), String(nombreGuardia2 || '').trim());
      req.input('CantidadPiezasManifiesto', sql.Int, parseInt(cantidadPiezasManifiesto, 10) || 0);
      req.input('NombreGuardia3', sql.NVarChar(sql.MAX), String(nombreGuardia3 || '').trim());
      req.input('NombreAgentes', sql.NVarChar(sql.MAX), String(nombreAgentes || '').trim());
      req.input('NombreGuardiaEscolta', sql.NVarChar(sql.MAX), String(nombreGuardiaEscolta || '').trim());
      req.input('CantidadPasajerosTransito', sql.Int, parseInt(cantidadPasajerosTransito, 10) || 0);
      req.input('CantidadPasajerosSalientes', sql.Int, parseInt(cantidadPasajerosSalientes, 10) || 0);
      req.input('PasajerosPerdieronVuelo', sql.NVarChar(sql.MAX), String(pasajerosPerdieronVuelo || '').trim());
      req.input('CantidadPiezasAceptadas', sql.Int, parseInt(cantidadPiezasAceptadas, 10) || 0);
      req.input('CantidadPiezasCargadas', sql.Int, parseInt(cantidadPiezasCargadas, 10) || 0);
      req.input('CantidadEqFacturados', sql.Int, parseInt(cantidadEqFacturados, 10) || 0);
      req.input('CantidadEqCargadas', sql.Int, parseInt(cantidadEqCargadas, 10) || 0);
      req.input('CantidadEqRetirados', sql.Int, parseInt(cantidadEqRetirados, 10) || 0);
      req.input('EqCoincidePasajero', sql.Bit, Boolean(eqCoincidePasajero));
      req.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
      req.input('NombreAgenteDelta', sql.NVarChar(sql.MAX), String(nombreAgenteDelta || '').trim());
      req.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

      if (targetId > 0) {
        await req.query(`
          UPDATE dbo.DetalleDAL
          SET RevisadoXRay = @RevisadoXRay,
              CantidadEqFisicos = @CantidadEqFisicos,
              Evaluadores = @Evaluadores,
              BolsasIngresadas = @BolsasIngresadas,
              CantidadEq = @CantidadEq,
              NombreGuardia = @NombreGuardia,
              CantidadEqGuardia = @CantidadEqGuardia,
              CantidadMaletas = @CantidadMaletas,
              NombreGuardia2 = @NombreGuardia2,
              CantidadPiezasManifiesto = @CantidadPiezasManifiesto,
              NombreGuardia3 = @NombreGuardia3,
              NombreAgentes = @NombreAgentes,
              NombreGuardiaEscolta = @NombreGuardiaEscolta,
              CantidadPasajerosTransito = @CantidadPasajerosTransito,
              CantidadPasajerosSalientes = @CantidadPasajerosSalientes,
              PasajerosPerdieronVuelo = @PasajerosPerdieronVuelo,
              CantidadPiezasAceptadas = @CantidadPiezasAceptadas,
              CantidadPiezasCargadas = @CantidadPiezasCargadas,
              CantidadEqFacturados = @CantidadEqFacturados,
              CantidadEqCargadas = @CantidadEqCargadas,
              CantidadEqRetirados = @CantidadEqRetirados,
              EqCoincidePasajero = @EqCoincidePasajero,
              LoginId = @LoginId,
              NombreAgenteDelta = @NombreAgenteDelta,
              CreadoPor = @Usuario,
              Creado = GETDATE()
          WHERE DetalleDALId = @DetalleDALId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const insRes = await req.query(`
          INSERT INTO dbo.DetalleDAL (
            ItinerarioId, RevisadoXRay, CantidadEqFisicos, Evaluadores, BolsasIngresadas, CantidadEq,
            NombreGuardia, CantidadEqGuardia, CantidadMaletas, NombreGuardia2, CantidadPiezasManifiesto,
            NombreGuardia3, NombreAgentes, NombreGuardiaEscolta, CantidadPasajerosTransito,
            CantidadPasajerosSalientes, PasajerosPerdieronVuelo, CantidadPiezasAceptadas,
            CantidadPiezasCargadas, CantidadEqFacturados, CantidadEqCargadas, CantidadEqRetirados,
            EqCoincidePasajero, LoginId, NombreAgenteDelta, CreadoPor, Creado, EstaEliminado
          )
          OUTPUT INSERTED.DetalleDALId
          VALUES (
            @ItinerarioId, @RevisadoXRay, @CantidadEqFisicos, @Evaluadores, @BolsasIngresadas, @CantidadEq,
            @NombreGuardia, @CantidadEqGuardia, @CantidadMaletas, @NombreGuardia2, @CantidadPiezasManifiesto,
            @NombreGuardia3, @NombreAgentes, @NombreGuardiaEscolta, @CantidadPasajerosTransito,
            @CantidadPasajerosSalientes, @PasajerosPerdieronVuelo, @CantidadPiezasAceptadas,
            @CantidadPiezasCargadas, @CantidadEqFacturados, @CantidadEqCargadas, @CantidadEqRetirados,
            @EqCoincidePasajero, @LoginId, @NombreAgenteDelta, @Usuario, GETDATE(), 0
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.DetalleDALId, 10) || 0;
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 11. Consulta y guarda/actualiza atómicamente "Sequence of Events Log" (dl-sel - DELTA)
   */
  static async consultarDetalleSEL(encabezadoId, itinerarioId) {
    const encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;
    if (encId > 0) {
      const res = await executeQuery(`
        SELECT TOP 1 *
        FROM dbo.DetalleSEL
        WHERE DetalleSELId = @DetalleSELId
          AND ItinerarioId = @ItinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
      `, [
        { name: 'DetalleSELId', type: sql.Int, value: encId },
        { name: 'ItinerarioId', type: sql.Int, value: itiId }
      ]);
      if (res.recordset?.[0]) return res.recordset[0];
    }
    if (itiId > 0) {
      const res = await executeQuery(`
        SELECT TOP 1 *
        FROM dbo.DetalleSEL
        WHERE ItinerarioId = @ItinerarioId
          AND ISNULL(EstaEliminado, 0) = 0
        ORDER BY DetalleSELId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      return res.recordset?.[0] || null;
    }
    return null;
  }

  static async guardarControlSELTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    usuarioAuditoria,
    horaCierreFila = '',
    cantidadPasajerosFila = 0,
    horaChequeadoFila = '',
    primerEqRevisada = '',
    ultimoEqRevisado = '',
    primerEqPuerta = '',
    ultimoEqPuerta = '',
    cantidadPasajerosEmbarque = '',
    horaInicioEmbarque = '',
    horaUltimoAbandona = '',
    horaDescargaEqCarga = '',
    horaInicioEqCarga = '',
    horaPuertasCerradasCar = '',
    horaPuertasCerradasCab = '',
    horaInicioRodajeNave = '',
    observaciones = ''
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('DetalleSELId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 DetalleSELId
          FROM dbo.DetalleSEL
          WHERE DetalleSELId = @DetalleSELId
            AND ItinerarioId = @ItinerarioId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El DetalleSELId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }
      }

      const req = new sql.Request(transaction);
      req.input('DetalleSELId', sql.Int, targetId);
      req.input('ItinerarioId', sql.Int, itiIdNum);
      req.input('LoginId', sql.Int, parseInt(loginId, 10) || 1);
      req.input('HoraCierreFila', sql.NVarChar(10), String(horaCierreFila || '').substring(0, 10));
      req.input('CantidadPasajerosFila', sql.Int, parseInt(cantidadPasajerosFila, 10) || 0);
      req.input('HoraChequeadoFila', sql.NVarChar(10), String(horaChequeadoFila || '').substring(0, 10));
      req.input('PrimerEqRevisada', sql.NVarChar(10), String(primerEqRevisada || '').substring(0, 10));
      req.input('UltimoEqRevisado', sql.NVarChar(10), String(ultimoEqRevisado || '').substring(0, 10));
      req.input('PrimerEqPuerta', sql.NVarChar(10), String(primerEqPuerta || '').substring(0, 10));
      req.input('UltimoEqPuerta', sql.NVarChar(10), String(ultimoEqPuerta || '').substring(0, 10));
      req.input('CantidadPasajerosEmbarque', sql.NVarChar(sql.MAX), String(cantidadPasajerosEmbarque ?? '0').trim());
      req.input('HoraInicioEmbarque', sql.NVarChar(10), String(horaInicioEmbarque || '').substring(0, 10));
      req.input('HoraUltimoAbandona', sql.NVarChar(10), String(horaUltimoAbandona || '').substring(0, 10));
      req.input('HoraDescargaEqCarga', sql.NVarChar(10), String(horaDescargaEqCarga || '').substring(0, 10));
      req.input('HoraInicioEqCarga', sql.NVarChar(10), String(horaInicioEqCarga || '').substring(0, 10));
      req.input('HoraPuertasCerradasCar', sql.NVarChar(10), String(horaPuertasCerradasCar || '').substring(0, 10));
      req.input('HoraPuertasCerradasCab', sql.NVarChar(10), String(horaPuertasCerradasCab || '').substring(0, 10));
      req.input('HoraInicioRodajeNave', sql.NVarChar(10), String(horaInicioRodajeNave || '').substring(0, 10));
      req.input('Observaciones', sql.NVarChar(sql.MAX), String(observaciones || '').trim());
      req.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

      if (targetId > 0) {
        await req.query(`
          UPDATE dbo.DetalleSEL
          SET LoginId = @LoginId,
              HoraCierreFila = @HoraCierreFila,
              CantidadPasajerosFila = @CantidadPasajerosFila,
              HoraChequeadoFila = @HoraChequeadoFila,
              PrimerEqRevisada = @PrimerEqRevisada,
              UltimoEqRevisado = @UltimoEqRevisado,
              PrimerEqPuerta = @PrimerEqPuerta,
              UltimoEqPuerta = @UltimoEqPuerta,
              CantidadPasajerosEmbarque = @CantidadPasajerosEmbarque,
              HoraInicioEmbarque = @HoraInicioEmbarque,
              HoraUltimoAbandona = @HoraUltimoAbandona,
              HoraDescargaEqCarga = @HoraDescargaEqCarga,
              HoraInicioEqCarga = @HoraInicioEqCarga,
              HoraPuertasCerradasCar = @HoraPuertasCerradasCar,
              HoraPuertasCerradasCab = @HoraPuertasCerradasCab,
              HoraInicioRodajeNave = @HoraInicioRodajeNave,
              Observaciones = @Observaciones,
              CreadoPor = @Usuario,
              Creado = GETDATE()
          WHERE DetalleSELId = @DetalleSELId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const insRes = await req.query(`
          INSERT INTO dbo.DetalleSEL (
            ItinerarioId, LoginId, HoraCierreFila, CantidadPasajerosFila, HoraChequeadoFila,
            PrimerEqRevisada, UltimoEqRevisado, PrimerEqPuerta, UltimoEqPuerta,
            CantidadPasajerosEmbarque, HoraInicioEmbarque, HoraUltimoAbandona,
            HoraDescargaEqCarga, HoraInicioEqCarga, HoraPuertasCerradasCar,
            HoraPuertasCerradasCab, HoraInicioRodajeNave, Observaciones,
            CreadoPor, Creado, EstaEliminado
          )
          OUTPUT INSERTED.DetalleSELId
          VALUES (
            @ItinerarioId, @LoginId, @HoraCierreFila, @CantidadPasajerosFila, @HoraChequeadoFila,
            @PrimerEqRevisada, @UltimoEqRevisado, @PrimerEqPuerta, @UltimoEqPuerta,
            @CantidadPasajerosEmbarque, @HoraInicioEmbarque, @HoraUltimoAbandona,
            @HoraDescargaEqCarga, @HoraInicioEqCarga, @HoraPuertasCerradasCar,
            @HoraPuertasCerradasCab, @HoraInicioRodajeNave, @Observaciones,
            @Usuario, GETDATE(), 0
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.DetalleSELId, 10) || 0;
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * Auxiliar interno para separar texto libre y bloque JSON embebido sin corromper observaciones existentes
   */
  static _splitMetaTag(rawText, tagName) {
    const str = String(rawText || '');
    const rx = new RegExp(`\\[${tagName}\\]([\\s\\S]*?)\\[\\/${tagName}\\]`);
    const m = str.match(rx);
    let meta = {};
    if (m && m[1]) {
      try {
        meta = JSON.parse(m[1]);
      } catch (_) {}
    }
    const cleanText = str.replace(rx, '').trim();
    return { cleanText, meta };
  }

  static _joinMetaTag(cleanText, metaObj, tagName) {
    const clean = String(cleanText || '').trim();
    const hasMeta = metaObj && Object.keys(metaObj).some(k => metaObj[k] !== undefined && metaObj[k] !== null && metaObj[k] !== '');
    if (!hasMeta) return clean;
    const tag = `[${tagName}]${JSON.stringify(metaObj)}[/${tagName}]`;
    return clean ? `${clean}\n${tag}` : tag;
  }

  /**
   * 12. Consulta y guarda/actualiza atómicamente "Aircraft Security Search" (ac-ass - AIR CANADA)
   */
  static async consultarDetalleASS(encabezadoId, itinerarioId) {
    let encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;

    if (!encId && itiId > 0) {
      const latest = await executeQuery(`
        SELECT TOP 1 E.EncabezadoASSId
        FROM dbo.EncabezadoASS E
        INNER JOIN dbo.ItinerariosASS I ON I.EncabezadoASSId = E.EncabezadoASSId
        WHERE I.ItinerarioId = @ItinerarioId
          AND ISNULL(I.EstaEliminado, 0) = 0
          AND ISNULL(E.EstaEliminado, 0) = 0
        ORDER BY E.EncabezadoASSId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      encId = parseInt(latest.recordset?.[0]?.EncabezadoASSId, 10) || 0;
    }

    if (!encId) return null;

    const res = await executeQuery(`
      SELECT TOP 1
        E.EncabezadoASSId,
        E.LoginId,
        E.EmpleadoId,
        E.Fecha,
        E.TipoBusqueda,
        E.HoraInicio,
        E.HoraFin,
        E.TeamSupervisor,
        E.CreadoPor,
        E.Creado,
        D.DetalleASSId,
        ISNULL(D.CompartimientosSuperiores, 1) AS CompartimientosSuperiores,
        ISNULL(D.ArmariosAreasTripulacion, 1) AS ArmariosAreasTripulacion,
        ISNULL(D.LavatoriosSellosSeguridad, 1) AS LavatoriosSellosSeguridad,
        ISNULL(D.AsientosBolsillosPared, 1) AS AsientosBolsillosPared,
        ISNULL(D.RespaldosBolsillosBandejas, 1) AS RespaldosBolsillosBandejas,
        ISNULL(D.CocinasCarritos, 1) AS CocinasCarritos,
        ISNULL(D.CojinesAsientos, 1) AS CojinesAsientos,
        ISNULL(D.ChalecosSalvavidas, 1) AS ChalecosSalvavidas,
        ISNULL(D.AreasDescansoTripulacion, 1) AS AreasDescansoTripulacion,
        O.Observaciones AS RawObservaciones
      FROM dbo.EncabezadoASS E
      LEFT JOIN dbo.DetalleASS D
        ON D.EncabezadoASSId = E.EncabezadoASSId
       AND ISNULL(D.EstaEliminado, 0) = 0
      LEFT JOIN dbo.ObservacionesASS O
        ON O.EncabezadoASSId = E.EncabezadoASSId
       AND ISNULL(O.EstaEliminado, 0) = 0
      WHERE E.EncabezadoASSId = @EncabezadoASSId
        AND ISNULL(E.EstaEliminado, 0) = 0
    `, [{ name: 'EncabezadoASSId', type: sql.Int, value: encId }]);

    const row = res.recordset?.[0] || null;
    if (!row) return null;

    const { cleanText, meta } = FormatosModel._splitMetaTag(row.RawObservaciones, 'ASS_META');
    return {
      ...row,
      Observaciones: cleanText,
      Meta: meta
    };
  }

  static async guardarControlASSTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    empleadoId,
    fechaIso,
    tipoBusqueda = 'PHYSICAL',
    horaInicio,
    horaFin,
    teamSupervisor,
    usuarioAuditoria,
    checks = {},
    observaciones = '',
    meta = null
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const horaIniSql = `${String(horaInicio).substring(0, 5)}:00`;
      const horaFinSql = `${String(horaFin).substring(0, 5)}:00`;
      const tipoBusSql = String(tipoBusqueda || 'PHYSICAL').toUpperCase() === 'VISUAL' ? 'VISUAL' : 'PHYSICAL';
      const empIdNum = parseInt(empleadoId, 10) || 1;
      const loginIdNum = parseInt(loginId, 10) || 1;
      const supName = String(teamSupervisor || '').trim();
      const obsSerialized = FormatosModel._joinMetaTag(observaciones, meta, 'ASS_META');

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoASSId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoASSId
          FROM dbo.EncabezadoASS E
          INNER JOIN dbo.ItinerariosASS I ON E.EncabezadoASSId = I.EncabezadoASSId
          WHERE E.EncabezadoASSId = @EncabezadoASSId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoASSId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoASSId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, loginIdNum);
        reqUpd.input('EmpleadoId', sql.Int, empIdNum);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('TipoBusqueda', sql.VarChar(10), tipoBusSql);
        reqUpd.input('HoraInicio', sql.VarChar(8), horaIniSql);
        reqUpd.input('HoraFin', sql.VarChar(8), horaFinSql);
        reqUpd.input('TeamSupervisor', sql.NVarChar(sql.MAX), supName);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoASS
          SET LoginId = @LoginId,
              EmpleadoId = @EmpleadoId,
              Fecha = @Fecha,
              TipoBusqueda = @TipoBusqueda,
              HoraInicio = TRY_CAST(@HoraInicio AS TIME(0)),
              HoraFin = TRY_CAST(@HoraFin AS TIME(0)),
              TeamSupervisor = @TeamSupervisor
          WHERE EncabezadoASSId = @EncabezadoASSId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, loginIdNum);
        reqIns.input('EmpleadoId', sql.Int, empIdNum);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('TipoBusqueda', sql.VarChar(10), tipoBusSql);
        reqIns.input('HoraInicio', sql.VarChar(8), horaIniSql);
        reqIns.input('HoraFin', sql.VarChar(8), horaFinSql);
        reqIns.input('TeamSupervisor', sql.NVarChar(sql.MAX), supName);
        reqIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoASS (
            LoginId, EmpleadoId, Fecha, TipoBusqueda, HoraInicio, HoraFin,
            TeamSupervisor, CreadoPor, Creado, EstaEliminado
          )
          OUTPUT INSERTED.EncabezadoASSId
          VALUES (
            @LoginId, @EmpleadoId, @Fecha, @TipoBusqueda,
            TRY_CAST(@HoraInicio AS TIME(0)), TRY_CAST(@HoraFin AS TIME(0)),
            @TeamSupervisor, @CreadoPor, GETDATE(), 0
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoASSId, 10) || 0;
        if (!targetId) throw new Error('No se pudo generar EncabezadoASSId en SIO.');

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, itiIdNum);
        reqIti.input('EncabezadoASSId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosASS (ItinerarioId, EncabezadoASSId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoASSId, 0)
        `);
      }

      // DetalleASS (9 checks BIT)
      const reqDetCheck = new sql.Request(transaction);
      reqDetCheck.input('EncabezadoASSId', sql.Int, targetId);
      const detExists = await reqDetCheck.query(`
        SELECT TOP 1 DetalleASSId
        FROM dbo.DetalleASS
        WHERE EncabezadoASSId = @EncabezadoASSId AND ISNULL(EstaEliminado, 0) = 0
      `);

      const reqDet = new sql.Request(transaction);
      reqDet.input('EncabezadoASSId', sql.Int, targetId);
      reqDet.input('CompartimientosSuperiores', sql.Bit, Boolean(checks.OverheadBins));
      reqDet.input('ArmariosAreasTripulacion', sql.Bit, Boolean(checks.ClosetsStorage));
      reqDet.input('LavatoriosSellosSeguridad', sql.Bit, Boolean(checks.Lavatories));
      reqDet.input('AsientosBolsillosPared', sql.Bit, Boolean(checks.SeatsUnder));
      reqDet.input('RespaldosBolsillosBandejas', sql.Bit, Boolean(checks.SeatBacksTrays));
      reqDet.input('CocinasCarritos', sql.Bit, Boolean(checks.GalleyAreas));
      reqDet.input('CojinesAsientos', sql.Bit, Boolean(checks.UnderSeatCushions));
      reqDet.input('ChalecosSalvavidas', sql.Bit, Boolean(checks.LifeVestPackages));
      reqDet.input('AreasDescansoTripulacion', sql.Bit, Boolean(checks.CrewRestAreasNA));
      reqDet.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);

      if (detExists.recordset && detExists.recordset.length > 0) {
        await reqDet.query(`
          UPDATE dbo.DetalleASS
          SET CompartimientosSuperiores = @CompartimientosSuperiores,
              ArmariosAreasTripulacion = @ArmariosAreasTripulacion,
              LavatoriosSellosSeguridad = @LavatoriosSellosSeguridad,
              AsientosBolsillosPared = @AsientosBolsillosPared,
              RespaldosBolsillosBandejas = @RespaldosBolsillosBandejas,
              CocinasCarritos = @CocinasCarritos,
              CojinesAsientos = @CojinesAsientos,
              ChalecosSalvavidas = @ChalecosSalvavidas,
              AreasDescansoTripulacion = @AreasDescansoTripulacion
          WHERE EncabezadoASSId = @EncabezadoASSId AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        await reqDet.query(`
          INSERT INTO dbo.DetalleASS (
            EncabezadoASSId, CompartimientosSuperiores, ArmariosAreasTripulacion,
            LavatoriosSellosSeguridad, AsientosBolsillosPared, RespaldosBolsillosBandejas,
            CocinasCarritos, CojinesAsientos, ChalecosSalvavidas, AreasDescansoTripulacion,
            CreadoPor, Creado, EstaEliminado
          )
          VALUES (
            @EncabezadoASSId, @CompartimientosSuperiores, @ArmariosAreasTripulacion,
            @LavatoriosSellosSeguridad, @AsientosBolsillosPared, @RespaldosBolsillosBandejas,
            @CocinasCarritos, @CojinesAsientos, @ChalecosSalvavidas, @AreasDescansoTripulacion,
            @CreadoPor, GETDATE(), 0
          )
        `);
      }

      // ObservacionesASS
      const reqObsCheck = new sql.Request(transaction);
      reqObsCheck.input('EncabezadoASSId', sql.Int, targetId);
      const obsExists = await reqObsCheck.query(`
        SELECT TOP 1 ObservacionesASSId
        FROM dbo.ObservacionesASS
        WHERE EncabezadoASSId = @EncabezadoASSId AND ISNULL(EstaEliminado, 0) = 0
      `);

      if (obsSerialized !== '') {
        const reqObs = new sql.Request(transaction);
        reqObs.input('EncabezadoASSId', sql.Int, targetId);
        reqObs.input('Observaciones', sql.NVarChar(sql.MAX), obsSerialized);
        reqObs.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        if (obsExists.recordset && obsExists.recordset.length > 0) {
          await reqObs.query(`
            UPDATE dbo.ObservacionesASS
            SET Observaciones = @Observaciones
            WHERE EncabezadoASSId = @EncabezadoASSId AND ISNULL(EstaEliminado, 0) = 0
          `);
        } else {
          await reqObs.query(`
            INSERT INTO dbo.ObservacionesASS (EncabezadoASSId, Observaciones, CreadoPor, Creado, EstaEliminado)
            VALUES (@EncabezadoASSId, @Observaciones, @CreadoPor, GETDATE(), 0)
          `);
        }
      } else if (obsExists.recordset && obsExists.recordset.length > 0) {
        const reqObsDel = new sql.Request(transaction);
        reqObsDel.input('EncabezadoASSId', sql.Int, targetId);
        await reqObsDel.query(`
          UPDATE dbo.ObservacionesASS
          SET EstaEliminado = 1
          WHERE EncabezadoASSId = @EncabezadoASSId
        `);
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 13. Consulta y guarda/actualiza atómicamente "Anexo A / Aircraft Access Control Log Sheet" (ac-anexoa - AIR CANADA)
   * Evita el SP defectuoso dbo.BuscarAnexoA y el filtro EmpleadoId>0 de dbo.InsertarAnexoA.
   */
  static async consultarDetalleAnexoA(encabezadoId, itinerarioId) {
    let encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;

    if (!encId && itiId > 0) {
      const latest = await executeQuery(`
        SELECT TOP 1 E.EncabezadoAnexoAId
        FROM dbo.EncabezadoAnexoA E
        INNER JOIN dbo.ItinerariosAnexoA I ON I.EncabezadoAnexoAId = E.EncabezadoAnexoAId
        WHERE I.ItinerarioId = @ItinerarioId
          AND ISNULL(I.EstaEliminado, 0) = 0
          AND ISNULL(E.EstaEliminado, 0) = 0
        ORDER BY E.EncabezadoAnexoAId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      encId = parseInt(latest.recordset?.[0]?.EncabezadoAnexoAId, 10) || 0;
    }

    if (!encId) return null;

    const headRes = await executeQuery(`
      SELECT TOP 1
        E.EncabezadoAnexoAId,
        E.LoginId,
        E.Fecha,
        E.PersonalMonitoreo,
        E.EmpleadoMonitoreoId,
        E.EncabezadoASSId,
        E.CreadoPor,
        E.Creado,
        empM.Nombre AS NombreSupervisor,
        obs.Observacion AS RawObservacion
      FROM dbo.EncabezadoAnexoA E
      LEFT JOIN dbo.Empleado empM ON empM.EmpleadoId = E.EmpleadoMonitoreoId
      LEFT JOIN dbo.ObservacionesAnexoA obs
        ON obs.EncabezadoAnexoAId = E.EncabezadoAnexoAId
       AND ISNULL(obs.EstaEliminado, 0) = 0
      WHERE E.EncabezadoAnexoAId = @EncabezadoAnexoAId
        AND ISNULL(E.EstaEliminado, 0) = 0
      ORDER BY obs.ObservacionesAnexoAId DESC
    `, [{ name: 'EncabezadoAnexoAId', type: sql.Int, value: encId }]);

    const enc = headRes.recordset?.[0] || null;
    if (!enc) return null;

    const detRes = await executeQuery(`
      SELECT
        D.DetalleAnexoAId,
        D.EncabezadoAnexoAId,
        D.Fecha,
        D.HoraInicio,
        D.HoraFin,
        D.EmpleadoId,
        COALESCE(NULLIF(LTRIM(RTRIM(D.PersonalMonitoreo)), ''), emp.Nombre, '') AS Nombre,
        D.AirportId AS NoTIA,
        D.Empresa,
        D.MotivoAcceso AS Motivo
      FROM dbo.DetalleAnexoA D
      LEFT JOIN dbo.Empleado emp ON emp.EmpleadoId = D.EmpleadoId
      WHERE D.EncabezadoAnexoAId = @EncabezadoAnexoAId
        AND ISNULL(D.EstaEliminado, 0) = 0
      ORDER BY D.HoraInicio ASC, D.DetalleAnexoAId ASC
    `, [{ name: 'EncabezadoAnexoAId', type: sql.Int, value: encId }]);

    const { cleanText, meta } = FormatosModel._splitMetaTag(enc.RawObservacion, 'ANEXOA_META');
    return {
      encabezado: {
        ...enc,
        Observaciones: cleanText,
        Meta: meta
      },
      detalles: detRes.recordset || []
    };
  }

  static async guardarControlAnexoATransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    fechaIso,
    supervisorEmpleadoId,
    supervisorNombre,
    usuarioAuditoria,
    registros = [],
    observaciones = '',
    meta = null
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const loginIdNum = parseInt(loginId, 10) || 1;
      const supIdNum = parseInt(supervisorEmpleadoId, 10) || null;
      const supNameStr = String(supervisorNombre || usuarioAuditoria || '').trim();
      const obsSerialized = FormatosModel._joinMetaTag(observaciones, meta, 'ANEXOA_META');

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoAnexoAId
          FROM dbo.EncabezadoAnexoA E
          INNER JOIN dbo.ItinerariosAnexoA I ON E.EncabezadoAnexoAId = I.EncabezadoAnexoAId
          WHERE E.EncabezadoAnexoAId = @EncabezadoAnexoAId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoAnexoAId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, loginIdNum);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('PersonalMonitoreo', sql.NVarChar(sql.MAX), supNameStr);
        reqUpd.input('EmpleadoMonitoreoId', sql.Int, supIdNum);
        reqUpd.input('ModificadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoAnexoA
          SET LoginId = @LoginId,
              Fecha = @Fecha,
              PersonalMonitoreo = @PersonalMonitoreo,
              EmpleadoMonitoreoId = @EmpleadoMonitoreoId,
              ModificadoPor = @ModificadoPor,
              Modificado = GETDATE()
          WHERE EncabezadoAnexoAId = @EncabezadoAnexoAId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, loginIdNum);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('PersonalMonitoreo', sql.NVarChar(sql.MAX), supNameStr);
        reqIns.input('EmpleadoMonitoreoId', sql.Int, supIdNum);
        reqIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoAnexoA (
            LoginId, Fecha, PersonalMonitoreo, EmpleadoMonitoreoId,
            EstaEliminado, CreadoPor, Creado
          )
          OUTPUT INSERTED.EncabezadoAnexoAId
          VALUES (
            @LoginId, @Fecha, @PersonalMonitoreo, @EmpleadoMonitoreoId,
            0, @CreadoPor, GETDATE()
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoAnexoAId, 10) || 0;
        if (!targetId) throw new Error('No se pudo generar EncabezadoAnexoAId en SIO.');

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, itiIdNum);
        reqIti.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqIti.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosAnexoA (
            ItinerarioId, EncabezadoAnexoAId, EstaEliminado, CreadoPor, Creado
          )
          VALUES (@ItinerarioId, @EncabezadoAnexoAId, 0, @CreadoPor, GETDATE())
        `);
      }

      // Soft Delete de filas removidas en UI
      const reqExist = new sql.Request(transaction);
      reqExist.input('EncabezadoAnexoAId', sql.Int, targetId);
      const existingRows = await reqExist.query(`
        SELECT DetalleAnexoAId
        FROM dbo.DetalleAnexoA
        WHERE EncabezadoAnexoAId = @EncabezadoAnexoAId AND ISNULL(EstaEliminado, 0) = 0
      `);
      const incomingIds = new Set(registros.map(r => parseInt(r.DetalleAnexoAId, 10)).filter(id => id > 0));
      for (const dbRow of existingRows.recordset || []) {
        const dbId = parseInt(dbRow.DetalleAnexoAId, 10);
        if (!incomingIds.has(dbId)) {
          const reqDel = new sql.Request(transaction);
          reqDel.input('DetalleAnexoAId', sql.Int, dbId);
          reqDel.input('EncabezadoAnexoAId', sql.Int, targetId);
          reqDel.input('ModificadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
          await reqDel.query(`
            UPDATE dbo.DetalleAnexoA
            SET EstaEliminado = 1, ModificadoPor = @ModificadoPor, Modificado = GETDATE()
            WHERE DetalleAnexoAId = @DetalleAnexoAId AND EncabezadoAnexoAId = @EncabezadoAnexoAId
          `);
        }
      }

      // Insert / Update de filas activas
      for (const r of registros) {
        const detId = parseInt(r.DetalleAnexoAId, 10) || 0;
        const hIn = `${String(r.HoraIngreso || '').substring(0, 5)}:00`;
        const hOutRaw = String(r.HoraSalida || '').trim();
        const hOut = hOutRaw ? `${hOutRaw.substring(0, 5)}:00` : null;

        const reqRow = new sql.Request(transaction);
        reqRow.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqRow.input('Fecha', sql.Date, fechaDate);
        reqRow.input('HoraInicio', sql.VarChar(8), hIn);
        reqRow.input('HoraFin', sql.VarChar(8), hOut);
        reqRow.input('EmpleadoId', sql.Int, parseInt(r.EmpleadoId, 10) || 0);
        reqRow.input('AirportId', sql.NVarChar(50), String(r.NoTIA || '').trim().substring(0, 50));
        reqRow.input('Empresa', sql.NVarChar(100), String(r.Empresa || 'LAATS').trim().substring(0, 100));
        reqRow.input('PersonalMonitoreo', sql.NVarChar(sql.MAX), String(r.Nombre || '').trim());
        reqRow.input('EmpleadoMonitoreoId', sql.Int, supIdNum);
        reqRow.input('MotivoAcceso', sql.NVarChar(sql.MAX), String(r.Motivo || '').trim());
        reqRow.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);

        if (detId > 0) {
          reqRow.input('DetalleAnexoAId', sql.Int, detId);
          await reqRow.query(`
            UPDATE dbo.DetalleAnexoA
            SET Fecha = @Fecha,
                HoraInicio = TRY_CAST(@HoraInicio AS TIME(0)),
                HoraFin = TRY_CAST(@HoraFin AS TIME(0)),
                EmpleadoId = @EmpleadoId,
                AirportId = @AirportId,
                Empresa = @Empresa,
                PersonalMonitoreo = @PersonalMonitoreo,
                EmpleadoMonitoreoId = @EmpleadoMonitoreoId,
                MotivoAcceso = @MotivoAcceso,
                EstaEliminado = 0,
                ModificadoPor = @Usuario,
                Modificado = GETDATE()
            WHERE DetalleAnexoAId = @DetalleAnexoAId AND EncabezadoAnexoAId = @EncabezadoAnexoAId
          `);
        } else {
          await reqRow.query(`
            INSERT INTO dbo.DetalleAnexoA (
              EncabezadoAnexoAId, Fecha, HoraInicio, HoraFin, EmpleadoId,
              AirportId, Empresa, PersonalMonitoreo, EmpleadoMonitoreoId,
              MotivoAcceso, EstaEliminado, CreadoPor, Creado
            )
            VALUES (
              @EncabezadoAnexoAId, @Fecha,
              TRY_CAST(@HoraInicio AS TIME(0)), TRY_CAST(@HoraFin AS TIME(0)),
              @EmpleadoId, @AirportId, @Empresa, @PersonalMonitoreo, @EmpleadoMonitoreoId,
              @MotivoAcceso, 0, @Usuario, GETDATE()
            )
          `);
        }
      }

      // ObservacionesAnexoA
      const reqObsCheck = new sql.Request(transaction);
      reqObsCheck.input('EncabezadoAnexoAId', sql.Int, targetId);
      const obsExists = await reqObsCheck.query(`
        SELECT TOP 1 ObservacionesAnexoAId
        FROM dbo.ObservacionesAnexoA
        WHERE EncabezadoAnexoAId = @EncabezadoAnexoAId AND ISNULL(EstaEliminado, 0) = 0
        ORDER BY ObservacionesAnexoAId DESC
      `);

      if (obsSerialized !== '') {
        const reqObs = new sql.Request(transaction);
        reqObs.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqObs.input('Observacion', sql.NVarChar(sql.MAX), obsSerialized);
        reqObs.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        if (obsExists.recordset && obsExists.recordset.length > 0) {
          reqObs.input('ObservacionesAnexoAId', sql.Int, obsExists.recordset[0].ObservacionesAnexoAId);
          await reqObs.query(`
            UPDATE dbo.ObservacionesAnexoA
            SET Observacion = @Observacion, ModificadoPor = @Usuario, Modificado = GETDATE()
            WHERE ObservacionesAnexoAId = @ObservacionesAnexoAId
          `);
        } else {
          await reqObs.query(`
            INSERT INTO dbo.ObservacionesAnexoA (EncabezadoAnexoAId, Observacion, EstaEliminado, CreadoPor, Creado)
            VALUES (@EncabezadoAnexoAId, @Observacion, 0, @Usuario, GETDATE())
          `);
        }
      } else if (obsExists.recordset && obsExists.recordset.length > 0) {
        const reqObsDel = new sql.Request(transaction);
        reqObsDel.input('EncabezadoAnexoAId', sql.Int, targetId);
        reqObsDel.input('Usuario', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqObsDel.query(`
          UPDATE dbo.ObservacionesAnexoA
          SET EstaEliminado = 1, ModificadoPor = @Usuario, Modificado = GETDATE()
          WHERE EncabezadoAnexoAId = @EncabezadoAnexoAId AND ISNULL(EstaEliminado, 0) = 0
        `);
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 14. Consulta y guarda/actualiza atómicamente "Annex B, to aircraft security search checklist" (ac-anexob - AIR CANADA)
   */
  static async consultarDetalleAnexoB(encabezadoId, itinerarioId) {
    let encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;

    if (!encId && itiId > 0) {
      const latest = await executeQuery(`
        SELECT TOP 1 E.EncabezadoAnexoBId
        FROM dbo.EncabezadoAnexoB E
        INNER JOIN dbo.ItinerariosAnexoB I ON I.EncabezadoAnexoBId = E.EncabezadoAnexoBId
        WHERE I.ItinerarioId = @ItinerarioId
          AND ISNULL(I.EstaEliminado, 0) = 0
          AND ISNULL(E.EstaEliminado, 0) = 0
        ORDER BY E.EncabezadoAnexoBId DESC
      `, [{ name: 'ItinerarioId', type: sql.Int, value: itiId }]);
      encId = parseInt(latest.recordset?.[0]?.EncabezadoAnexoBId, 10) || 0;
    }

    if (!encId) return null;

    const headRes = await executeQuery(`
      SELECT TOP 1
        E.EncabezadoAnexoBId,
        E.LoginId,
        E.Fecha,
        E.CreadoPor,
        E.Creado,
        E.ModificadoPor,
        E.Modificado
      FROM dbo.EncabezadoAnexoB E
      WHERE E.EncabezadoAnexoBId = @EncabezadoAnexoBId
        AND ISNULL(E.EstaEliminado, 0) = 0
    `, [{ name: 'EncabezadoAnexoBId', type: sql.Int, value: encId }]);

    const enc = headRes.recordset?.[0] || null;
    if (!enc) return null;

    const detRes = await executeQuery(`
      SELECT
        D.DetalleAnexoBId,
        D.EncabezadoAnexoBId,
        D.ZonasAnexoBId,
        Z.Nombre AS NombreZonaCatalogo,
        D.EmpleadoId,
        emp.Nombre AS NombreEmpleado,
        D.TipoBusqueda,
        D.Remarks
      FROM dbo.DetalleAnexoB D
      LEFT JOIN dbo.ZonasAnexoB Z ON Z.ZonasAnexoBId = D.ZonasAnexoBId
      LEFT JOIN dbo.Empleado emp ON emp.EmpleadoId = D.EmpleadoId
      WHERE D.EncabezadoAnexoBId = @EncabezadoAnexoBId
        AND ISNULL(D.EstaEliminado, 0) = 0
      ORDER BY D.ZonasAnexoBId ASC, D.DetalleAnexoBId ASC
    `, [{ name: 'EncabezadoAnexoBId', type: sql.Int, value: encId }]);

    let docMeta = {};
    const zones = [];
    for (const row of detRes.recordset || []) {
      const step1 = FormatosModel._splitMetaTag(row.Remarks, 'ANEXOB_DOC');
      if (Object.keys(step1.meta).length > 0 && Object.keys(docMeta).length === 0) {
        docMeta = step1.meta;
      }
      const step2 = FormatosModel._splitMetaTag(step1.cleanText, 'ZONE_JSON');
      if (Object.keys(step2.meta).length > 0) {
        if (!step2.meta._headerOnly) {
          zones.push({
            DetalleAnexoBId: row.DetalleAnexoBId,
            ZonasAnexoBId: row.ZonasAnexoBId,
            EmployeeInfo: step2.meta.EmployeeInfo || row.NombreEmpleado || '',
            Zone: step2.meta.Zone || row.NombreZonaCatalogo || '',
            SearchType: step2.meta.SearchType || (row.TipoBusqueda ? 'Visual' : 'Física'),
            TimeStarted: step2.meta.TimeStarted || '',
            TimeCompleted: step2.meta.TimeCompleted || '',
            Remarks: step2.meta.Remarks || step2.cleanText || ''
          });
        }
      } else if (step2.cleanText || row.NombreEmpleado) {
        zones.push({
          DetalleAnexoBId: row.DetalleAnexoBId,
          ZonasAnexoBId: row.ZonasAnexoBId,
          EmployeeInfo: row.NombreEmpleado || '',
          Zone: row.NombreZonaCatalogo || '',
          SearchType: row.TipoBusqueda ? 'Visual' : 'Física',
          TimeStarted: '',
          TimeCompleted: '',
          Remarks: step2.cleanText || ''
        });
      }
    }

    return {
      encabezado: {
        ...enc,
        DocMeta: docMeta
      },
      zones
    };
  }

  static async guardarControlAnexoBTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    fechaIso,
    usuarioAuditoria,
    leadEmpleadoId = null,
    generalSearchType = 'Física',
    docMeta = {},
    zonesSearch = []
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const loginIdNum = parseInt(loginId, 10) || 1;

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoAnexoBId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoAnexoBId
          FROM dbo.EncabezadoAnexoB E
          INNER JOIN dbo.ItinerariosAnexoB I ON E.EncabezadoAnexoBId = I.EncabezadoAnexoBId
          WHERE E.EncabezadoAnexoBId = @EncabezadoAnexoBId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoAnexoBId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoAnexoBId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, loginIdNum);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('ModificadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoAnexoB
          SET LoginId = @LoginId,
              Fecha = @Fecha,
              ModificadoPor = @ModificadoPor,
              Modificado = GETDATE()
          WHERE EncabezadoAnexoBId = @EncabezadoAnexoBId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, loginIdNum);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoAnexoB (
            LoginId, Fecha, EstaEliminado, CreadoPor, Creado
          )
          OUTPUT INSERTED.EncabezadoAnexoBId
          VALUES (@LoginId, @Fecha, 0, @CreadoPor, GETDATE())
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoAnexoBId, 10) || 0;
        if (!targetId) throw new Error('No se pudo generar EncabezadoAnexoBId en SIO.');

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, itiIdNum);
        reqIti.input('EncabezadoAnexoBId', sql.Int, targetId);
        reqIti.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosAnexoB (
            ItinerarioId, EncabezadoAnexoBId, EstaEliminado, CreadoPor, Creado
          )
          VALUES (@ItinerarioId, @EncabezadoAnexoBId, 0, @CreadoPor, GETDATE())
        `);
      }

      // Soft Delete detalles anteriores del encabezado antes de registrar snapshot vigente
      const reqSoft = new sql.Request(transaction);
      reqSoft.input('EncabezadoAnexoBId', sql.Int, targetId);
      reqSoft.input('ModificadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
      await reqSoft.query(`
        UPDATE dbo.DetalleAnexoB
        SET EstaEliminado = 1, ModificadoPor = @ModificadoPor, Modificado = GETDATE()
        WHERE EncabezadoAnexoBId = @EncabezadoAnexoBId
          AND ISNULL(EstaEliminado, 0) = 0
      `);

      const rowsToInsert = zonesSearch.length > 0
        ? zonesSearch.slice(0, 5)
        : [{ _headerOnly: true, EmployeeInfo: '', Zone: 'Part 1 Only', SearchType: generalSearchType, TimeStarted: '', TimeCompleted: '', Remarks: '' }];

      for (let idx = 0; idx < rowsToInsert.length; idx++) {
        const z = rowsToInsert[idx];
        const zonaFkId = (idx % 5) + 1;
        const tipoBit = String(z.SearchType || '').toLowerCase() === 'visual' ? 1 : 0;
        const zoneJsonObj = z._headerOnly
          ? { _headerOnly: true }
          : {
              EmployeeInfo: String(z.EmployeeInfo || '').trim(),
              Zone: String(z.Zone || '').trim(),
              SearchType: tipoBit === 1 ? 'Visual' : 'Física',
              TimeStarted: String(z.TimeStarted || '').trim(),
              TimeCompleted: String(z.TimeCompleted || '').trim(),
              Remarks: String(z.Remarks || '').trim()
            };

        const humanPrefix = z._headerOnly
          ? ''
          : `${zoneJsonObj.Zone} | ${zoneJsonObj.EmployeeInfo} | ${zoneJsonObj.TimeStarted}-${zoneJsonObj.TimeCompleted}${zoneJsonObj.Remarks ? ` | ${zoneJsonObj.Remarks}` : ''}`;

        let remarksPayload = FormatosModel._joinMetaTag(humanPrefix, zoneJsonObj, 'ZONE_JSON');
        if (idx === 0) {
          remarksPayload = FormatosModel._joinMetaTag(remarksPayload, docMeta, 'ANEXOB_DOC');
        }

        const reqZ = new sql.Request(transaction);
        reqZ.input('EncabezadoAnexoBId', sql.Int, targetId);
        reqZ.input('ZonasAnexoBId', sql.Int, zonaFkId);
        reqZ.input('EmpleadoId', sql.Int, parseInt(z.EmpleadoId, 10) || leadEmpleadoId || null);
        reqZ.input('TipoBusqueda', sql.Bit, tipoBit === 1);
        reqZ.input('Remarks', sql.NVarChar(sql.MAX), remarksPayload);
        reqZ.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqZ.query(`
          INSERT INTO dbo.DetalleAnexoB (
            EncabezadoAnexoBId, ZonasAnexoBId, EmpleadoId, TipoBusqueda,
            Remarks, EstaEliminado, CreadoPor, Creado
          )
          VALUES (
            @EncabezadoAnexoBId, @ZonasAnexoBId, @EmpleadoId, @TipoBusqueda,
            @Remarks, 0, @CreadoPor, GETDATE()
          )
        `);
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }

  /**
   * 15. Consulta y guarda/actualiza atómicamente "Lista de Inspección de Aeronave de Carga" (latam-liadc - LAN CARGO / LATAM)
   */
  static async consultarDetalleLIADC(encabezadoId, itinerarioId) {
    const encId = parseInt(encabezadoId, 10) || 0;
    const itiId = parseInt(itinerarioId, 10) || 0;
    if (!encId && !itiId) return null;

    const spRes = await executeStoredProcedure('dbo.BuscarLIADC', [
      { name: 'ItinerarioId', type: sql.Int, value: itiId || null },
      { name: 'EncabezadoLIADCId', type: sql.Int, value: encId || null }
    ]);

    const statusMsg = String(spRes.recordsets?.[0]?.[0]?.Mensaje || '').toLowerCase();
    const row = spRes.recordsets?.[1]?.[0] || null;
    if (!row || !row.EncabezadoLIADCId || statusMsg.includes('no se encontro')) {
      return null;
    }

    const { cleanText, meta } = FormatosModel._splitMetaTag(row.Observaciones, 'LIADC_META');
    return {
      ...row,
      Observaciones: cleanText,
      Meta: meta
    };
  }

  static async guardarControlLIADCTransaccional({
    encabezadoId = 0,
    itinerarioId,
    loginId,
    fechaIso,
    puente = '',
    horaInicioInsp,
    horaTerminoInsp = '',
    supLaats,
    notificacionComandante = 'VERBAL',
    iniciales = '',
    observaciones = '',
    checks = {},
    meta = null,
    usuarioAuditoria
  }) {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let targetId = parseInt(encabezadoId, 10) || 0;
      const itiIdNum = parseInt(itinerarioId, 10);
      const loginIdNum = parseInt(loginId, 10) || 1;
      const supLaatsNum = parseInt(supLaats, 10);
      const fechaDate = new Date(`${fechaIso}T00:00:00.000Z`);
      const horaIniSql = horaInicioInsp ? `${String(horaInicioInsp).substring(0, 5)}:00` : null;
      const horaTerSql = horaTerminoInsp ? `${String(horaTerminoInsp).substring(0, 5)}:00` : null;
      const puenteStr = String(puente || '').trim() || null;
      const notifStr = String(notificacionComandante || 'VERBAL').trim().toUpperCase() === 'ESCRITA' ? 'ESCRITA' : 'VERBAL';
      const inicialesStr = String(iniciales || '').trim().toUpperCase().substring(0, 3);
      const obsSerialized = FormatosModel._joinMetaTag(observaciones, meta, 'LIADC_META');

      if (targetId > 0) {
        const reqCheck = new sql.Request(transaction);
        reqCheck.input('EncabezadoLIADCId', sql.Int, targetId);
        reqCheck.input('ItinerarioId', sql.Int, itiIdNum);
        const checkRes = await reqCheck.query(`
          SELECT TOP 1 E.EncabezadoLIADCId
          FROM dbo.EncabezadoLIADC E
          INNER JOIN dbo.ItinerariosLIADC I ON E.EncabezadoLIADCId = I.EncabezadoLIADCId
          WHERE E.EncabezadoLIADCId = @EncabezadoLIADCId
            AND I.ItinerarioId = @ItinerarioId
            AND ISNULL(E.EstaEliminado, 0) = 0
            AND ISNULL(I.EstaEliminado, 0) = 0
        `);
        if (!checkRes.recordset || checkRes.recordset.length === 0) {
          const idorErr = new Error(`Acceso denegado (Anti-IDOR): El EncabezadoLIADCId #${targetId} no pertenece a la operación activa.`);
          idorErr.statusCode = 403;
          throw idorErr;
        }

        const reqUpd = new sql.Request(transaction);
        reqUpd.input('EncabezadoLIADCId', sql.Int, targetId);
        reqUpd.input('LoginId', sql.Int, loginIdNum);
        reqUpd.input('Fecha', sql.Date, fechaDate);
        reqUpd.input('Puente', sql.NVarChar(sql.MAX), puenteStr);
        reqUpd.input('HoraInicioInsp', sql.VarChar(8), horaIniSql);
        reqUpd.input('HoraTerminoInsp', sql.VarChar(8), horaTerSql);
        reqUpd.input('SupLaats', sql.Int, supLaatsNum);
        reqUpd.input('NotificacionComandante', sql.NVarChar(100), notifStr);
        await reqUpd.query(`
          UPDATE dbo.EncabezadoLIADC
          SET LoginId = @LoginId,
              Fecha = @Fecha,
              Puente = @Puente,
              HoraInicioInsp = TRY_CAST(@HoraInicioInsp AS TIME(0)),
              HoraTerminoInsp = TRY_CAST(@HoraTerminoInsp AS TIME(0)),
              SupLaats = @SupLaats,
              NotificacionComandante = @NotificacionComandante
          WHERE EncabezadoLIADCId = @EncabezadoLIADCId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const reqIns = new sql.Request(transaction);
        reqIns.input('LoginId', sql.Int, loginIdNum);
        reqIns.input('Fecha', sql.Date, fechaDate);
        reqIns.input('Puente', sql.NVarChar(sql.MAX), puenteStr);
        reqIns.input('HoraInicioInsp', sql.VarChar(8), horaIniSql);
        reqIns.input('HoraTerminoInsp', sql.VarChar(8), horaTerSql);
        reqIns.input('SupLaats', sql.Int, supLaatsNum);
        reqIns.input('NotificacionComandante', sql.NVarChar(100), notifStr);
        reqIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        const insRes = await reqIns.query(`
          INSERT INTO dbo.EncabezadoLIADC (
            LoginId, Fecha, Puente, HoraInicioInsp, HoraTerminoInsp,
            SupLaats, NotificacionComandante, CreadoPor, Creado, EstaEliminado
          )
          OUTPUT INSERTED.EncabezadoLIADCId
          VALUES (
            @LoginId, @Fecha, @Puente,
            TRY_CAST(@HoraInicioInsp AS TIME(0)),
            TRY_CAST(@HoraTerminoInsp AS TIME(0)),
            @SupLaats, @NotificacionComandante, @CreadoPor, GETDATE(), 0
          )
        `);
        targetId = parseInt(insRes.recordset?.[0]?.EncabezadoLIADCId, 10) || 0;
        if (!targetId) throw new Error('No se pudo generar EncabezadoLIADCId en SIO.');

        const reqIti = new sql.Request(transaction);
        reqIti.input('ItinerarioId', sql.Int, itiIdNum);
        reqIti.input('EncabezadoLIADCId', sql.Int, targetId);
        await reqIti.query(`
          INSERT INTO dbo.ItinerariosLIADC (ItinerarioId, EncabezadoLIADCId, EstaEliminado)
          VALUES (@ItinerarioId, @EncabezadoLIADCId, 0)
        `);
      }

      // DetalleLIADC (24 checks BIT + Iniciales)
      const reqDetCheck = new sql.Request(transaction);
      reqDetCheck.input('EncabezadoLIADCId', sql.Int, targetId);
      const detExists = await reqDetCheck.query(`
        SELECT TOP 1 DetalleLIADCId
        FROM dbo.DetalleLIADC
        WHERE EncabezadoLIADCId = @EncabezadoLIADCId
          AND ISNULL(EstaEliminado, 0) = 0
      `);

      const bitFields = [
        'CabinaPilotos_AreasVisibles',
        'CabinaPilotos_Asientos',
        'CabinaPilotos_CompartAccesiblesDiversos',
        'CabinaPilotos_AccesoCompartElectronico',
        'Cocinas_AreasVisibles',
        'Cocinas_CarrosSusCompart',
        'Cocinas_ContenedoresBasura',
        'Cocinas_CompartAccesibles',
        'Banos_AreasVisibles',
        'Banos_CompartAccesibles',
        'Banos_ContenedoresBasura',
        'AreasExternas_AreasVisibles',
        'AreasExternas_AccesoCompartElectronico',
        'AreasExternas_FososTrenesAterrizaje',
        'AreasExternas_RegistrosCavidadesExt',
        'AreasExternas_BodegaDelantera',
        'AreasExternas_CompartElectronico',
        'AreasExternas_CompartBotellaOxigeno',
        'AreasExternas_CompartAireAcondicionado',
        'AreasExternas_CompartConexionesElectronicas',
        'AreasExternas_BodegaTrasera',
        'AreasExternas_Bulk',
        'AreasExternas_CompartSensorIncendio',
        'AreasExternas_CompartAguaBano'
      ];

      const reqDet = new sql.Request(transaction);
      reqDet.input('EncabezadoLIADCId', sql.Int, targetId);
      bitFields.forEach((f) => {
        reqDet.input(f, sql.Bit, Boolean(checks[f]));
      });
      reqDet.input('Iniciales', sql.VarChar(3), inicialesStr);
      reqDet.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);

      if (detExists.recordset && detExists.recordset.length > 0) {
        const setSql = bitFields.map(f => `${f} = @${f}`).join(', ');
        await reqDet.query(`
          UPDATE dbo.DetalleLIADC
          SET ${setSql},
              Iniciales = @Iniciales
          WHERE EncabezadoLIADCId = @EncabezadoLIADCId
            AND ISNULL(EstaEliminado, 0) = 0
        `);
      } else {
        const colList = bitFields.join(', ');
        const valList = bitFields.map(f => `@${f}`).join(', ');
        await reqDet.query(`
          INSERT INTO dbo.DetalleLIADC (
            EncabezadoLIADCId, ${colList}, Iniciales, CreadoPor, Creado, EstaEliminado
          )
          VALUES (
            @EncabezadoLIADCId, ${valList}, @Iniciales, @CreadoPor, GETDATE(), 0
          )
        `);
      }

      // ObservacionesLIADC (observaciones libres + LIADC_META)
      const reqObsCheck = new sql.Request(transaction);
      reqObsCheck.input('EncabezadoLIADCId', sql.Int, targetId);
      const obsExists = await reqObsCheck.query(`
        SELECT TOP 1 ObservacionesLIADCId
        FROM dbo.ObservacionesLIADC
        WHERE EncabezadoLIADCId = @EncabezadoLIADCId
          AND ISNULL(EstaEliminado, 0) = 0
      `);

      if (obsExists.recordset && obsExists.recordset.length > 0) {
        if (obsSerialized) {
          const reqObsUpd = new sql.Request(transaction);
          reqObsUpd.input('EncabezadoLIADCId', sql.Int, targetId);
          reqObsUpd.input('Observaciones', sql.NVarChar(sql.MAX), obsSerialized);
          await reqObsUpd.query(`
            UPDATE dbo.ObservacionesLIADC
            SET Observaciones = @Observaciones
            WHERE EncabezadoLIADCId = @EncabezadoLIADCId
              AND ISNULL(EstaEliminado, 0) = 0
          `);
        } else {
          const reqObsSoftDel = new sql.Request(transaction);
          reqObsSoftDel.input('EncabezadoLIADCId', sql.Int, targetId);
          await reqObsSoftDel.query(`
            UPDATE dbo.ObservacionesLIADC
            SET EstaEliminado = 1
            WHERE EncabezadoLIADCId = @EncabezadoLIADCId
              AND ISNULL(EstaEliminado, 0) = 0
          `);
        }
      } else if (obsSerialized) {
        const reqObsIns = new sql.Request(transaction);
        reqObsIns.input('EncabezadoLIADCId', sql.Int, targetId);
        reqObsIns.input('Observaciones', sql.NVarChar(sql.MAX), obsSerialized);
        reqObsIns.input('CreadoPor', sql.NVarChar(sql.MAX), usuarioAuditoria);
        await reqObsIns.query(`
          INSERT INTO dbo.ObservacionesLIADC (
            EncabezadoLIADCId, Observaciones, CreadoPor, Creado, EstaEliminado
          )
          VALUES (
            @EncabezadoLIADCId, @Observaciones, @CreadoPor, GETDATE(), 0
          )
        `);
      }

      await transaction.commit();
      return { encabezadoId: targetId };
    } catch (err) {
      try { await transaction.rollback(); } catch (_) {}
      throw err;
    }
  }
}

module.exports = FormatosModel;

