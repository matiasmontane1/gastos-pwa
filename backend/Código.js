// La clave del Web App vive en Configuracion del proyecto -> Propiedades del script
// (propiedad API_SECRET), no en el codigo. Ver checkAuth_.
var GASTOS_SHEET = 'Gastos';
var REGLAS_SHEET = 'Reglas';
var DASH_MENSUAL_SHEET = 'Dashboard Mensual';
var DASH_PROMEDIO_SHEET = 'Dashboard Promedio';
var OLD_DASHBOARD_SHEET = 'Dashboard';
var CATEGORIAS_SHEET = 'Categorias';

function runSetupNow() { setupSheet(); }

function runRebuildNow() { rebuildDashboards(); }

function getSS() {
return SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheet() {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET) || ss.insertSheet(GASTOS_SHEET);
  gastos.clear();
  gastos.getRange(1,1,1,8).setValues([['Fecha','Monto','Comercio/Servicio','Categoria','Mail de origen','Estado','ID Mail','Eliminado']]);
  gastos.getRange(1,1,1,8).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
  gastos.setFrozenRows(1);
  gastos.setColumnWidth(1,100); gastos.setColumnWidth(2,100); gastos.setColumnWidth(3,220);
  gastos.setColumnWidth(4,170); gastos.setColumnWidth(5,320); gastos.setColumnWidth(6,190); gastos.setColumnWidth(7,160); gastos.setColumnWidth(8,100);
  gastos.getRange(2,6,2000,1).setDataValidation(
  SpreadsheetApp.newDataValidation()
  .requireValueInList(['confirmado','auto - sin confirmar','pendiente de revisar'], true)
  .setAllowInvalid(true)
  .build()
  );
  gastos.getRange(2,1,2000,1).setNumberFormat('yyyy-mm-dd');
  gastos.getRange(2,2,2000,1).setNumberFormat('#,##0');

  var reglas = ss.getSheetByName(REGLAS_SHEET) || ss.insertSheet(REGLAS_SHEET);
  reglas.clear();
  reglas.getRange(1,1,1,3).setValues([['Remitente/Comercio','Categoria','Ultima actualizacion']]);
  reglas.getRange(1,1,1,3).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
  reglas.setFrozenRows(1);
  reglas.setColumnWidth(1,280); reglas.setColumnWidth(2,170); reglas.setColumnWidth(3,190);

  ss.setActiveSheet(gastos);
  removeExistingTriggers_();
  ScriptApp.newTrigger('onEditInstallable').forSpreadsheet(ss).onEdit().create();

  rebuildDashboards();
  }

  function removeExistingTriggers_() {
    ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'onEditInstallable') ScriptApp.deleteTrigger(t);
    });
    }

    function onEditInstallable(e) {
    try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== GASTOS_SHEET) return;
    var col = e.range.getColumn();
    var row = e.range.getRow();
    if (row === 1) return;
    if (col !== 4 && col !== 6) return;
    var rowVals = sheet.getRange(row, 1, 1, 7).getValues()[0];
    var comercio = String(rowVals[2] || '').trim();
    var categoria = String(rowVals[3] || '').trim();
    var estado = String(rowVals[5] || '').trim();
    if (!comercio || !categoria) return;
    if (col === 4 || estado === 'confirmado') {
    upsertRegla_(comercio, categoria);
    if (col === 4 && estado !== 'confirmado') {
    sheet.getRange(row, 6).setValue('confirmado');
    }
    }
    } catch (err) {}
    }

    function upsertRegla_(comercio, categoria) {
    var ss = getSS();
    var reglas = ss.getSheetByName(REGLAS_SHEET);
    var data = reglas.getDataRange().getValues();
    var now = new Date();
    for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === comercio.toLowerCase()) {
    reglas.getRange(i+1, 2).setValue(categoria);
    reglas.getRange(i+1, 3).setValue(now);
    return;
    }
    }
    reglas.appendRow([comercio, categoria, now]);
    }

    function parseFechaSafe_(fechaStr) {
    if (!fechaStr) return new Date();
    var m = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), 12, 0, 0);
    var d = new Date(fechaStr);
    return isNaN(d.getTime()) ? new Date() : d;
    }

    // Valida la fecha de una edicion: yyyy-MM-dd, dia real del calendario y no futura.
    // hoyStr es hoy en la zona del Sheet (yyyy-MM-dd). Devuelve { ok, fecha } o { ok:false, error }.
    function validarFechaEdicion_(fechaStr, hoyStr) {
      var m = String(fechaStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return { ok: false, error: 'fecha invalida' };
      var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      var f = new Date(y, mo - 1, d, 12, 0, 0);
      if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return { ok: false, error: 'fecha invalida' };
      if (m[0] > hoyStr) return { ok: false, error: 'la fecha no puede ser futura' };
      return { ok: true, fecha: f };
    }

    function isTransferencia_(item) {
    var text = (String(item.comercio || '') + ' ' + String(item.categoria || '')).toLowerCase();
    return /transferenc/.test(text);
    }
    function getCategoriasSheet_() {
      var ss = getSS();
      var sheet = ss.getSheetByName(CATEGORIAS_SHEET);
      if (!sheet) {
      sheet = ss.insertSheet(CATEGORIAS_SHEET);
      sheet.getRange(1,1,1,1).setValues([['Categoria']]);
      sheet.getRange(1,1,1,1).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
      var gastos = ss.getSheetByName(GASTOS_SHEET);
      if (gastos) {
      var lastRow = gastos.getLastRow();
      if (lastRow >= 2) {
      var cats = gastos.getRange(2,4,lastRow-1,1).getValues().map(function(r){ return String(r[0]||'').trim(); }).filter(function(c){ return c; });
      var uniq = [];
      cats.forEach(function(c){ if (uniq.indexOf(c) === -1) uniq.push(c); });
      if (uniq.length) sheet.getRange(2,1,uniq.length,1).setValues(uniq.map(function(c){ return [c]; }));
      }
      }
      }
      var headerB = sheet.getRange(1,2).getValue();
      if (!headerB) {
      sheet.getRange(1,2).setValue('Icono');
      sheet.getRange(1,2).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
      }
      return sheet;
      }

      function getCategories_() {
      var sheet = getCategoriasSheet_();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return [];
      return sheet.getRange(2,1,lastRow-1,1).getValues().map(function(r){ return String(r[0]||'').trim(); }).filter(function(c){ return c; });
      }

function getCategoryIcons_() {
  var sheet = getCategoriasSheet_();
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var values = sheet.getRange(2,1,lastRow-1,2).getValues();
  for (var i=0;i<values.length;i++) {
  var nombre = String(values[i][0]||'').trim();
  var icono = String(values[i][1]||'').trim();
  if (nombre && icono) map[nombre] = icono;
  }
  return map;
  }

  function setCategoryIcon_(nombre, icono) {
  nombre = String(nombre||'').trim();
  icono = String(icono||'').trim();
  if (!nombre) return { ok:false, error: 'nombre vacio' };
  var sheet = getCategoriasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok:false, error: 'categoria no encontrada' };
  var values = sheet.getRange(2,1,lastRow-1,1).getValues();
  for (var i=0;i<values.length;i++) {
  if (String(values[i][0]||'').trim() === nombre) {
  sheet.getRange(2+i,2).setValue(icono);
  return { ok:true };
  }
  }
  return { ok:false, error: 'categoria no encontrada' };
  }


function addCategory_(nombre) {
      nombre = String(nombre||'').trim();
      if (!nombre) return { ok:false, error: 'nombre vacio' };
      var sheet = getCategoriasSheet_();
      var existing = getCategories_();
      if (existing.indexOf(nombre) !== -1) return { ok:true, alreadyExists:true };
      sheet.appendRow([nombre]);
      return { ok:true };
      }

      function renameCategory_(oldNombre, newNombre) {
      oldNombre = String(oldNombre||'').trim();
      newNombre = String(newNombre||'').trim();
      if (!oldNombre || !newNombre) return { ok:false, error: 'nombres invalidos' };
      var ss = getSS();
      var sheet = getCategoriasSheet_();
      var lastRow = sheet.getLastRow();
      var updatedCatRow = false;
      if (lastRow >= 2) {
      var values = sheet.getRange(2,1,lastRow-1,1).getValues();
      for (var i=0;i<values.length;i++) {
      if (String(values[i][0]||'').trim() === oldNombre) {
      sheet.getRange(2+i,1).setValue(newNombre);
      updatedCatRow = true;
      }
      }
      }
      if (!updatedCatRow) sheet.appendRow([newNombre]);
      var gastos = ss.getSheetByName(GASTOS_SHEET);
      var count = 0;
      if (gastos) {
      var gLastRow = gastos.getLastRow();
      if (gLastRow >= 2) {
      var catRange = gastos.getRange(2,4,gLastRow-1,1);
      var catValues = catRange.getValues();
      for (var j=0;j<catValues.length;j++) {
      if (String(catValues[j][0]||'').trim() === oldNombre) {
      catValues[j][0] = newNombre;
      count++;
      }
      }
      if (count > 0) catRange.setValues(catValues);
      }
      }
      var reglas = ss.getSheetByName(REGLAS_SHEET);
      if (reglas) {
      var rLastRow = reglas.getLastRow();
      if (rLastRow >= 2) {
      var rCatRange = reglas.getRange(2,2,rLastRow-1,1);
      var rCatValues = rCatRange.getValues();
      var rChanged = false;
      for (var k=0;k<rCatValues.length;k++) {
      if (String(rCatValues[k][0]||'').trim() === oldNombre) {
      rCatValues[k][0] = newNombre;
      rChanged = true;
      }
      }
      if (rChanged) rCatRange.setValues(rCatValues);
      }
      }
      rebuildDashboards();
      return { ok:true, expensesUpdated: count };
      }

      function deleteCategory_(nombre) {
      nombre = String(nombre||'').trim();
      if (!nombre) return { ok:false, error: 'nombre vacio' };
      var ss = getSS();
      var sheet = getCategoriasSheet_();
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
      var values = sheet.getRange(2,1,lastRow-1,1).getValues();
      for (var i=values.length-1;i>=0;i--) {
      if (String(values[i][0]||'').trim() === nombre) {
      sheet.deleteRow(2+i);
      }
      }
      }
      var gastos = ss.getSheetByName(GASTOS_SHEET);
      var count = 0;
      if (gastos) {
      var gLastRow = gastos.getLastRow();
      if (gLastRow >= 2) {
      var catRange = gastos.getRange(2,4,gLastRow-1,1);
      var catValues = catRange.getValues();
      var estRange = gastos.getRange(2,6,gLastRow-1,1);
      var estValues = estRange.getValues();
      for (var j=0;j<catValues.length;j++) {
      if (String(catValues[j][0]||'').trim() === nombre) {
      catValues[j][0] = '';
      estValues[j][0] = 'pendiente de revisar';
      count++;
      }
      }
      if (count > 0) { catRange.setValues(catValues); estRange.setValues(estValues); }
      }
      }
      var reglas = ss.getSheetByName(REGLAS_SHEET);
      if (reglas) {
      var rLastRow = reglas.getLastRow();
      if (rLastRow >= 2) {
      var rValues = reglas.getRange(2,1,rLastRow-1,2).getValues();
      for (var k=rValues.length-1;k>=0;k--) {
      if (String(rValues[k][1]||'').trim() === nombre) {
      reglas.deleteRow(2+k);
      }
      }
      }
      }
      rebuildDashboards();
      return { ok:true, expensesCleared: count };
      }


    // Lecturas que comparten doPost (la app) y doGet (temporal, ver S3).
    function handleRead_(action) {
      if (action === 'getExpenses') return { ok: true, expenses: getExpenses_() };
      if (action === 'getLastRun') return { ok: true, lastRun: getLastSuccessfulRun_() };
      if (action === 'getLog') return { ok: true, logs: getLog_() };
      if (action === 'getCategories') return { ok: true, categories: getCategories_(), icons: getCategoryIcons_() };
      if (action === 'getDeletedExpenses') return { ok: true, expenses: getDeletedExpenses_() };
      return null;
    }

    // S3 (oct 2026): la app ya no usa doGet, lee por POST. Se mantiene un tiempo para que las
    // copias viejas de la app sigan funcionando; despues se quita.
    function doGet(e) {
      try {
        checkAuth_(e);
        var lectura = handleRead_(e.parameter.action);
        return jsonOut_(lectura || { ok: false, error: 'unknown action' });
      } catch (err) { return jsonOut_({ ok: false, error: String(err) }); }
    }

    // S4 (oct 2026): solo quedan las acciones que usa la app. Las demas funciones
// internas (appendExpense_, rebuildDashboards, appendLog_...) siguen existiendo
// para el escaneo y el editor, pero ya no se exponen por el Web App.
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
  var body = JSON.parse(e.postData.contents);
  checkAuth_({ parameter: { secret: body.secret } });
  // S3: las lecturas tambien viajan por POST para que la clave vaya en el cuerpo y no en la URL.
  // Leer no escribe, asi que no toma el lock.
  var lectura = handleRead_(body.action);
  if (lectura) return jsonOut_(lectura);
  // B3: un solo escritor a la vez (trigger de Gmail o la app).
  if (!lock.tryLock(30000)) return jsonOut_({ ok: false, error: 'Servidor ocupado, intenta de nuevo' });
    var action = body.action;
    if (action === 'appendManualExpense') return jsonOut_(appendManualExpense_(body));
    if (action === 'updateExpenseCategory') return jsonOut_(updateExpenseCategory_(body));
    if (action === 'updateExpense') return jsonOut_(updateExpense_(body));
    if (action === 'deleteExpense') return jsonOut_(deleteExpense_(body));
    if (action === 'addCategory') return jsonOut_(addCategory_(body.nombre));
    if (action === 'renameCategory') return jsonOut_(renameCategory_(body.oldNombre, body.newNombre));
    if (action === 'deleteCategory') return jsonOut_(deleteCategory_(body.nombre));
    if (action === 'setCategoryIcon') return jsonOut_(setCategoryIcon_(body.nombre, body.icono));
    if (action === 'restoreExpense') return jsonOut_(restoreExpense_(body));
    if (action === 'setFijoManual') return jsonOut_(setFijoManual_(body));
    return jsonOut_({ ok: false, error: 'unknown action' });
    } catch (err) { return jsonOut_({ ok: false, error: String(err) }); } finally { lock.releaseLock(); }
    }

    function checkAuth_(e) {
  var secret = e && e.parameter && e.parameter.secret;
  var expected = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!expected || secret !== expected) throw new Error('unauthorized');
}

    function jsonOut_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
    }

    function getLogSheet_() {
      var ss = getSS();
      var sheet = ss.getSheetByName('Log') || ss.insertSheet('Log');
      if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,3).setValues([['Fecha/Hora','Resumen','Estado']]);
      sheet.getRange(1,1,1,3).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1,150); sheet.setColumnWidth(2,600); sheet.setColumnWidth(3,100);
      }
      return sheet;
      }

      function appendLog_(body) {
        var sheet = getLogSheet_();
        sheet.insertRowAfter(1);
        var row = [new Date(), String(body.resumen || ''), String(body.estado || 'ok')];
        sheet.getRange(2,1,1,3).setValues([row]);
        return { ok: true };
        }

        function getLastSuccessfulRun_() {
          var sheet = getLogSheet_();
          var lastRow = sheet.getLastRow();
          if (lastRow < 2) return null;
          var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
          for (var i = 0; i < data.length; i++) {
          if (String(data[i][2]).trim().toLowerCase() === 'ok') return new Date(data[i][0]).toISOString();
          }
          return null;
          }

          function getLog_() {
          var sheet = getLogSheet_();
          var lastRow = sheet.getLastRow();
          if (lastRow < 2) return [];
          var numRows = Math.min(lastRow - 1, 200);
          var data = sheet.getRange(2, 1, numRows, 3).getValues();
          return data.map(function (row) {
          return {
          fecha: row[0] ? new Date(row[0]).toISOString() : '',
          resumen: String(row[1] || ''),
          estado: String(row[2] || '')
          };
          });
          }

          function appendManualExpense_(body) {
          var ss = getSS();
          var gastos = ss.getSheetByName(GASTOS_SHEET);
          var comercio = String(body.comercio || '').trim();
          var categoria = String(body.categoria || '').trim();
          var estado = 'confirmado';
          if (isTransferencia_({ comercio: comercio, categoria: categoria })) {
          categoria = '';
          estado = 'pendiente de revisar';
          }
          var mailOrigen = 'Manual';
          var idMail = 'manual-' + new Date().getTime() + '-' + Math.floor(Math.random() * 10000);
          gastos.appendRow([
          parseFechaSafe_(body.fecha),
          Number(body.monto) || 0,
          comercio,
          categoria,
          mailOrigen,
          estado,
          idMail,
          false
          ]);
          return { ok: true, idMail: idMail };
          }

        
      
    
    // ---------------------------------------------------------------------------
    // Escaneo automatico de Gmail para registrar gastos (via trigger de tiempo).
    // Reemplaza al mecanismo anterior basado en una tarea programada externa.
    // ---------------------------------------------------------------------------
    var BANK_SEARCH_QUERY_ = '(from:bancoedwards.cl OR from:bancochile.cl) -from:comercial.bancoedwards.cl newer_than:10d';

    // B1 + B3: toma el bloqueo, corre el escaneo y deja registro en Log si falla.
function scanGmailAndRegisterExpenses() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) {
    appendLog_({ resumen: 'Corrida automatica omitida: otra operacion tuvo el bloqueo por mas de 2 minutos.', estado: 'error' });
    return;
  }
  try {
    scanCore_();
  } catch (err) {
    appendLog_({ resumen: 'Error en corrida automatica: ' + (err && err.stack ? err.stack : String(err)), estado: 'error' });
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function scanCore_() {
    var tz = getSS().getSpreadsheetTimeZone();
    var threads = GmailApp.search(BANK_SEARCH_QUERY_, 0, 50);

    var items = [];
    var unrecognized = [];
    var excludedIncoming = 0;

    threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
    var subject = String(msg.getSubject() || '');
    var id = msg.getId();
    var body = String(msg.getPlainBody() || '');
    var fecha = Utilities.formatDate(msg.getDate(), tz, 'yyyy-MM-dd');

    if (subject.indexOf('Cargo en Cuenta') !== -1) {
    var mCargo = body.match(/* \s+ en vez de espacios: el texto del mail a veces corta 'con cargo a \nCuenta' (montos >= $100.000) */ /se\s+ha\s+realizado\s+una\s+compra\s+por\s*\$\s*([\d.,]+)\s+con\s+cargo\s+a\s+Cuenta\s*\*+\d+\s+en\s+([\s\S]+?)\s+el\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (mCargo) {
    items.push({fecha: mCargo[5] + '-' + mCargo[4] + '-' + mCargo[3], monto: parseCLPAmount_(mCargo[1]), comercio: mCargo[2].replace(/\s+/g, ' ').trim(), mailOrigen: subject, idMail: id});
    } else {
    unrecognized.push({id: id, subject: subject, motivo: 'Cargo en Cuenta sin match de monto/comercio'});
    }
    } else if (subject.indexOf('Transferencia a Terceros') !== -1) {
    var mNombre = body.match(/Nombre y Apellido\s*\n?\s*([^\n]+)/i);
    var mMonto = body.match(/Monto\s*\n?\s*\$([\d.,]+)/i);
    if (mNombre && mMonto) {
    items.push({fecha: fecha, monto: parseCLPAmount_(mMonto[1]), comercio: mNombre[1].trim() + ' (transferencia)', mailOrigen: subject, idMail: id});
    } else {
    unrecognized.push({id: id, subject: subject, motivo: 'Transferencia a Terceros sin match de nombre/monto'});
    }
}     else if (/^Transferencias de Fondos a /i.test(subject) && /usted\s+ha\s+efectuado\s+una\s+transferencia\s+de\s+fondos\s+a/i.test(body)) {
var mNombreDest = body.match(/Nombre\s+([^\n]+)/i);
var mMontoDest = body.match(/Monto\s+\$([\d.,]+)/i);
     var nombreDest = mNombreDest ? mNombreDest[1].trim() : subject.replace(/^Transferencias de Fondos a\s*/i, '').trim();
     if (mMontoDest && nombreDest) {
     items.push({fecha: fecha, monto: parseCLPAmount_(mMontoDest[1]), comercio: nombreDest + ' (transferencia)', mailOrigen: subject, idMail: id});
     } else {
     unrecognized.push({id: id, subject: subject, motivo: 'Transferencias de Fondos a X sin match de nombre/monto'});
     }
    } else if (/cartola/i.test(subject)) {
      // Cartola mensual del banco: no es un gasto, se ignora sin avisar.
    } else if (subject.indexOf('Aviso de transferencia de fondos') !== -1) {
    excludedIncoming++;
    } else {
    unrecognized.push({id: id, subject: subject, motivo: 'Asunto no reconocido'});
    }
    });
    });

    var ctx = loadAppendCtx_();
  var results = items.map(function (it) { return appendExpense_(it, ctx); });
    var addedCount = 0, skippedCount = 0, totalAdded = 0;
    results.forEach(function(r, i) {
    if (r.ok && !r.skipped) { addedCount++; totalAdded += Number(items[i].monto) || 0; }
    else if (r.ok && r.skipped) { skippedCount++; }
    });

    if (addedCount > 0) rebuildDashboards();

    var resumen = 'Corrida automatica (Apps Script trigger): ' + addedCount + ' gasto(s) nuevo(s)' + (addedCount ? ' por un total de $' + totalAdded.toLocaleString('es-CL') : '') + '. ' + skippedCount + ' ya estaban cargados (duplicados). ' + excludedIncoming + ' transferencia(s) entrante(s) excluida(s).';
    if (unrecognized.length > 0) {
    resumen += ' ATENCION: ' + unrecognized.length + ' correo(s) no reconocido(s), revisar a mano: ' + unrecognized.map(function(u) { return '"' + u.subject + '" (' + u.motivo + ', id ' + u.id + ')'; }).join('; ') + '.';
    }

    appendLog_({resumen: resumen, estado: 'ok'});
    }

    function parseCLPAmount_(s) {
    return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
    }

    function runGmailScanNow() { scanGmailAndRegisterExpenses(); }

// Correr desde el editor para recrear los triggers (quedan en 'Principal', con el ultimo codigo guardado).
function runSetupGmailScanTriggerNow() { setupGmailScanTrigger_(); }

    function setupGmailScanTrigger_() {
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'scanGmailAndRegisterExpenses') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('scanGmailAndRegisterExpenses').timeBased().atHour(7).nearMinute(1).everyDays(1).create();
    ScriptApp.newTrigger('scanGmailAndRegisterExpenses').timeBased().atHour(15).nearMinute(1).everyDays(1).create();
  ScriptApp.newTrigger('scanGmailAndRegisterExpenses').timeBased().atHour(20).nearMinute(1).everyDays(1).create();
    }
    

    function getRulesMap_() {
    var ss = getSS();
    var reglas = ss.getSheetByName(REGLAS_SHEET);
    var data = reglas.getDataRange().getValues();
    var map = {};
    for (var i = 1; i < data.length; i++) {
    var k = String(data[i][0] || '').trim();
    var v = String(data[i][1] || '').trim();
    if (k && v) map[k] = v;
    }
    return map;
    }

    function getProcessedIds_() {
    var ss = getSS();
    var gastos = ss.getSheetByName(GASTOS_SHEET);
    var lastRow = gastos.getLastRow();
    if (lastRow < 2) return [];
    var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues().map(function(r){ return r[0]; }).filter(String);
    return ids;
    }

function getExpenses_() {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET);
  var lastRow = gastos.getLastRow();
  if (lastRow < 2) return [];
  var tz = ss.getSpreadsheetTimeZone();
  var data = gastos.getRange(2, 1, lastRow - 1, 9).getValues();
  return data.map(function(r) {
  var fecha = r[0];
  if (r[7] === true || String(r[7]).toUpperCase() === 'TRUE') return null;
  var fechaStr = (fecha instanceof Date) ? Utilities.formatDate(fecha, tz, 'yyyy-MM-dd') : String(fecha || '');
  return {
  fecha: fechaStr,
  monto: Number(r[1]) || 0,
  comercio: String(r[2] || ''),
  categoria: String(r[3] || ''),
  mailOrigen: String(r[4] || ''),
  estado: String(r[5] || ''),
  idMail: String(r[6] || ''),
  fijoManual: (r[8] === true || String(r[8]).trim().toLowerCase() === 'true') ? true : ((r[8] === false || String(r[8]).trim().toLowerCase() === 'false') ? false : null)
  };
  }).filter(function(x){ return x && x.idMail; });
  }

  function getDeletedExpenses_() {
    var ss = getSS();
    var gastos = ss.getSheetByName(GASTOS_SHEET);
    var lastRow = gastos.getLastRow();
    if (lastRow < 2) return [];
    var tz = ss.getSpreadsheetTimeZone();
    var data = gastos.getRange(2, 1, lastRow - 1, 8).getValues();
    return data.map(function(r) {
      var fecha = r[0];
      var eliminado = r[7] === true || String(r[7]).toUpperCase() === 'TRUE';
      if (!eliminado) return null;
      var fechaStr = (fecha instanceof Date) ? Utilities.formatDate(fecha, tz, 'yyyy-MM-dd') : String(fecha || '');
      return {
        fecha: fechaStr,
        monto: Number(r[1]) || 0,
        comercio: String(r[2] || ''),
        categoria: String(r[3] || ''),
        mailOrigen: String(r[4] || ''),
        estado: String(r[5] || ''),
        idMail: String(r[6] || '')
      };
    }).filter(function(x){ return x && x.idMail; });
  }

  function updateExpenseCategory_(body) {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET);
  var lastRow = gastos.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
  var idMail = String(body.idMail || '').trim();
  var categoria = String(body.categoria || '').trim();
  if (!idMail) return { ok: false, error: 'idMail requerido' };
  var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
  if (String(ids[i][0]).trim() === idMail) {
  var row = i + 2;
  gastos.getRange(row, 4).setValue(categoria);
  gastos.getRange(row, 6).setValue('confirmado');
  var comercio = String(gastos.getRange(row, 3).getValue() || '').trim();
  if (comercio && categoria) upsertRegla_(comercio, categoria);
  return { ok: true, row: row };
  }
  }
  return { ok: false, error: 'idMail no encontrado' };
  }

  function updateExpense_(body) {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET);
  var lastRow = gastos.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
  var idMail = String(body.idMail || '').trim();
  if (!idMail) return { ok: false, error: 'idMail requerido' };
  // La fecha se valida antes de escribir nada, para no dejar la fila a medio editar.
  var fechaNueva = null;
  if (body.fecha !== undefined && body.fecha !== null && String(body.fecha).trim() !== '') {
  var hoyStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var vf = validarFechaEdicion_(body.fecha, hoyStr);
  if (!vf.ok) return vf;
  fechaNueva = vf.fecha;
  }
  var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
  if (String(ids[i][0]).trim() === idMail) {
  var row = i + 2;
  if (fechaNueva) gastos.getRange(row, 1).setValue(fechaNueva);
  if (body.monto !== undefined && body.monto !== null && String(body.monto) !== '') {
  gastos.getRange(row, 2).setValue(Number(body.monto) || 0);
  }
  if (body.comercio !== undefined && body.comercio !== null && String(body.comercio).trim() !== '') {
  gastos.getRange(row, 3).setValue(String(body.comercio).trim());
  }
  if (body.categoria !== undefined && body.categoria !== null && String(body.categoria).trim() !== '') {
  gastos.getRange(row, 4).setValue(String(body.categoria).trim());
  }
  gastos.getRange(row, 6).setValue('confirmado');
  var comercioFinal = String(gastos.getRange(row, 3).getValue() || '').trim();
  var categoriaFinal = String(gastos.getRange(row, 4).getValue() || '').trim();
  if (comercioFinal && categoriaFinal) upsertRegla_(comercioFinal, categoriaFinal);
  return { ok: true, row: row };
  }
  }
  return { ok: false, error: 'idMail no encontrado' };
  }

  function deleteExpense_(body) {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET);
  var lastRow = gastos.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
  var idMail = String(body.idMail || '').trim();
  if (!idMail) return { ok: false, error: 'idMail requerido' };
  var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
  if (String(ids[i][0]).trim() === idMail) {
  var row = i + 2;
  gastos.getRange(row, 8).setValue(true);
  return { ok: true };
  }
  }
  return { ok: false, error: 'idMail no encontrado' };
  }

  function restoreExpense_(body) {
    var ss = getSS();
    var gastos = ss.getSheetByName(GASTOS_SHEET);
    var lastRow = gastos.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
    var idMail = String(body.idMail || '').trim();
    if (!idMail) return { ok: false, error: 'idMail requerido' };
    var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === idMail) {
        var row = i + 2;
        gastos.getRange(row, 8).setValue(false);
        return { ok: true };
      }
    }
    return { ok: false, error: 'idMail no encontrado' };
  }

  function setFijoManual_(body) {
    var ss = getSS();
    var gastos = ss.getSheetByName(GASTOS_SHEET);
    var lastRow = gastos.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
    var idMail = String(body.idMail || '').trim();
    if (!idMail) return { ok: false, error: 'idMail requerido' };
    var valor = body.valor;
    var texto = valor === true ? 'true' : (valor === false ? 'false' : '');
    var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === idMail) {
        var row = i + 2;
        gastos.getRange(row, 9).setValue(texto);
        // Aseguramos el header de la columna I la primera vez que se usa, sin
        // tocar el resto de la hoja (no llamamos a setupSheet()/clear()).
        if (!String(gastos.getRange(1, 9).getValue() || '').trim()) {
          gastos.getRange(1, 9).setValue('Fijo Manual');
        }
        return { ok: true };
      }
    }
    return { ok: false, error: 'idMail no encontrado' };
  }

  function resetExpenseToPending_(body) {
  var ss = getSS();
  var gastos = ss.getSheetByName(GASTOS_SHEET);
  var lastRow = gastos.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'no hay gastos' };
  var idMail = String(body.idMail || '').trim();
  if (!idMail) return { ok: false, error: 'idMail requerido' };
  var ids = gastos.getRange(2, 7, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
  if (String(ids[i][0]).trim() === idMail) {
  var row = i + 2;
  gastos.getRange(row, 4).setValue('');
  gastos.getRange(row, 6).setValue('pendiente de revisar');
  return { ok: true, row: row };
  }
  }
  return { ok: false, error: 'idMail no encontrado' };
  }


    // B4: IDs ya procesados, reglas y hoja se leen una vez por corrida.
function loadAppendCtx_() {
  var ids = {};
  getProcessedIds_().forEach(function (id) { ids[String(id).trim()] = true; });
  return { gastos: getSS().getSheetByName(GASTOS_SHEET), ids: ids, rules: getRulesMap_() };
}

function appendExpense_(item, ctx) {
  ctx = (ctx && typeof ctx === 'object' && ctx.ids) ? ctx : loadAppendCtx_();
  var gastos = ctx.gastos;
  if (item.idMail && ctx.ids[String(item.idMail).trim()]) {
    return { ok: true, skipped: true, reason: 'duplicate', idMail: item.idMail };
    }
    var rules = ctx.rules;
    var comercio = String(item.comercio || '').trim();
    var categoria = String(item.categoria || '').trim();
    var estado = String(item.estado || '').trim();

// Las transferencias quedan siempre pendientes de clasificación manual (nunca se auto-categorizan ni auto-confirman).
    if (!isTransferencia_(item) && rules[comercio]) {
        categoria = rules[comercio];
            estado = 'confirmado';
                }

    gastos.appendRow([
    parseFechaSafe_(item.fecha),
    Number(item.monto) || 0,
    comercio,
    categoria,
    item.mailOrigen || '',
    estado || (categoria ? 'auto - sin confirmar' : 'pendiente de revisar'),
    item.idMail || '',
    false
    ]);
    if (item.idMail) ctx.ids[String(item.idMail).trim()] = true;
  return { ok: true, skipped: false };
    }

    function rebuildDashboards() {
    var ss = getSS();
    PropertiesService.getScriptProperties().setProperty('lastRun', new Date().toISOString());

    var oldDash = ss.getSheetByName(OLD_DASHBOARD_SHEET);
    if (oldDash) ss.deleteSheet(oldDash);

    var tz = ss.getSpreadsheetTimeZone();
    var currentMonth = Utilities.formatDate(new Date(), tz, 'yyyy-MM');

    var dm = ss.getSheetByName(DASH_MENSUAL_SHEET) || ss.insertSheet(DASH_MENSUAL_SHEET);
    dm.clear();
    dm.getRange('A1').setValue('Dashboard Mensual').setFontSize(18).setFontWeight('bold');

    dm.getRange('A3').setValue('Mes a visualizar:').setFontWeight('bold');
    dm.getRange('D3').setValue('Gasto total del mes:').setFontWeight('bold');
    dm.getRange('E3').setFormula('=IFERROR(SUMPRODUCT((TEXT(Gastos!A2:A1000;"yyyy-mm")=$B$3)*(Gastos!H2:H1000<>TRUE)*Gastos!B2:B1000);0)');
    dm.getRange('E3').setNumberFormat('#,##0');

    dm.getRange('N1').setValue('Meses disponibles');
    dm.getRange('N2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(TEXT(Gastos!$A$2:$A$1000;"yyyy-mm");Gastos!$A$2:$A$1000<>"";Gastos!$H$2:$H$1000<>TRUE)));"")');
    SpreadsheetApp.flush();

    dm.getRange('B3').setDataValidation(
    SpreadsheetApp.newDataValidation()
    .requireValueInRange(dm.getRange('N2:N200'), true)
    .setAllowInvalid(true)
    .build()
    );
    dm.getRange('B3').setNumberFormat('@');
    dm.getRange('B3').setValue(currentMonth);

    dm.getRange('A5').setValue('Gasto por categoria (mes seleccionado)').setFontWeight('bold');
    dm.getRange('A6').setFormula('=IFERROR(QUERY(Gastos!A2:H1000;"select D, sum(B) where D != \'\' and H != true and (year(A)*100+month(A)+1) = "&(VALUE(LEFT($B$3;4))*100+VALUE(RIGHT($B$3;2)))&" group by D order by sum(B) desc label D \'Categoria\', sum(B) \'Total\'";0);"Sin datos para este mes")');

    dm.getRange('D5').setValue('Detalle de transacciones (mes seleccionado)').setFontWeight('bold');
dm.getRange('D6').setFormula('=IFERROR(QUERY(Gastos!A2:H1000;"select A, C, B, D where A is not null and H != true and (year(A)*100+month(A)+1) = "&(VALUE(LEFT($B$3;4))*100+VALUE(RIGHT($B$3;2)))&" order by A desc label A \'Fecha\', C \'Comercio/Servicio\', B \'Monto\', D \'Categoria\'";0);"Sin datos para este mes")');
    dm.getRange('D6:D200').setNumberFormat('yyyy-mm-dd');

    dm.setColumnWidth(1,170); dm.setColumnWidth(2,120); dm.setColumnWidth(4,100);
    dm.setColumnWidth(5,220); dm.setColumnWidth(6,100); dm.setColumnWidth(7,170);

    dm.getCharts().forEach(function(c){ dm.removeChart(c); });
    SpreadsheetApp.flush();
    var pieChart = dm.newChart().setChartType(Charts.ChartType.PIE).addRange(dm.getRange('A6:B30'))
    .setPosition(3,9,0,0).setOption('title','Gasto por categoria (mes seleccionado)').setOption('width',480).setOption('height',300).build();
    dm.insertChart(pieChart);

    var dp = ss.getSheetByName(DASH_PROMEDIO_SHEET) || ss.insertSheet(DASH_PROMEDIO_SHEET);
    dp.clear();
    dp.getRange('A1').setValue('Dashboard Promedio Mensual').setFontSize(18).setFontWeight('bold');

    dp.getRange('A3').setValue('Meses con datos registrados:').setFontWeight('bold');
    dp.getRange('B3').setFormula('=IFERROR(MAX(1;COUNTA(UNIQUE(FILTER(TEXT(Gastos!A2:A1000;"yyyy-mm");Gastos!A2:A1000<>"";Gastos!H2:H1000<>TRUE))));1)');

    dp.getRange('A4').setValue('Promedio mensual total (todas las categorias):').setFontWeight('bold');
    dp.getRange('B4').setFormula('=IFERROR(SUMPRODUCT(Gastos!B2:B1000*(Gastos!H2:H1000<>TRUE))/$B$3;0)');
    dp.getRange('B4').setNumberFormat('#,##0');

    dp.getRange('D3').setValue('Gasto total acumulado:').setFontWeight('bold');
    dp.getRange('E3').setFormula('=SUMPRODUCT(Gastos!B2:B1000*(Gastos!H2:H1000<>TRUE))');
    dp.getRange('E3').setNumberFormat('#,##0');
    dp.getRange('D4').setValue('Mails pendientes de revisar:').setFontWeight('bold');
    dp.getRange('E4').setFormula('=SUMPRODUCT((Gastos!F2:F1000="pendiente de revisar")*(Gastos!H2:H1000<>TRUE))');

    dp.getRange('A6').setValue('Promedio mensual por categoria').setFontWeight('bold');
    dp.getRange('A7').setFormula('=IFERROR(QUERY(Gastos!A2:H1000;"select D, sum(B), sum(B)/"&$B$3&" where D != \'\' and H != true group by D order by sum(B) desc label D \'Categoria\', sum(B) \'Total acumulado\', sum(B)/"&$B$3&" \'Promedio mensual\'";0);"Sin datos aun")');

    dp.setColumnWidth(1,170); dp.setColumnWidth(2,150); dp.setColumnWidth(3,150);
    dp.setColumnWidth(4,220); dp.setColumnWidth(5,120);

    dp.getCharts().forEach(function(c){ dp.removeChart(c); });
    SpreadsheetApp.flush();
    var barChart = dp.newChart().setChartType(Charts.ChartType.COLUMN).addRange(dp.getRange('A7:A30')).addRange(dp.getRange('C7:C30'))
    .setPosition(7,6,0,0).setOption('title','Promedio mensual por categoria').setOption('width',480).setOption('height',300).build();
    dp.insertChart(barChart);

    ss.setActiveSheet(dm);
    }