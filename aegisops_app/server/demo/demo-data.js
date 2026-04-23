/**
 * AegisOps Demo Mode - Mock Data Generator
 * Simulates real gas management plant data for all connectors
 */

const DEMO_CONFIG = {
  enabled: true,
  interval: 5000, // 5 seconds
  plant_name: 'Газоперерабатывающий завод №3',
  region: 'Ташкент, Узбекистан',
};

// Gas plant sensor simulation
function generateGasPlantData() {
  const now = new Date();
  const baseTemp = 18 + Math.sin(now.getHours() / 24 * Math.PI * 2) * 5;
  const basePressure = 2.5 + Math.random() * 0.3;
  const baseFlow = 1200 + Math.random() * 200;

  return {
    timestamp: now.toISOString(),
    plant: DEMO_CONFIG.plant_name,
    region: DEMO_CONFIG.region,
    
    // SCADA / OPC UA data
    scada: {
      grs1: {
        pressure: Math.round((basePressure + Math.random() * 0.1) * 100) / 100,
        temperature: Math.round((baseTemp + Math.random() * 2) * 10) / 10,
        flow_rate: Math.round(baseFlow + Math.random() * 50),
        valve_position: Math.round(70 + Math.random() * 10),
        status: 'normal'
      },
      grs2: {
        pressure: Math.round((basePressure - 0.1 + Math.random() * 0.1) * 100) / 100,
        temperature: Math.round((baseTemp - 1 + Math.random() * 2) * 10) / 10,
        flow_rate: Math.round(baseFlow * 0.8 + Math.random() * 30),
        valve_position: Math.round(65 + Math.random() * 10),
        status: 'normal'
      },
      grs3: {
        pressure: Math.round((basePressure + 0.2 + Math.random() * 0.15) * 100) / 100,
        temperature: Math.round((baseTemp + 2 + Math.random() * 2) * 10) / 10,
        flow_rate: Math.round(baseFlow * 1.2 + Math.random() * 60),
        valve_position: Math.round(80 + Math.random() * 5),
        status: Math.random() > 0.95 ? 'warning' : 'normal'
      }
    },
    
    // MQTT telemetry
    mqtt: {
      topics: {
        'gas/telemetry/grs1/pressure': { value: basePressure, unit: 'bar', quality: 'good' },
        'gas/telemetry/grs1/temperature': { value: baseTemp, unit: '°C', quality: 'good' },
        'gas/telemetry/grs1/flow': { value: baseFlow, unit: 'm³/h', quality: 'good' },
        'gas/telemetry/grs2/pressure': { value: basePressure - 0.1, unit: 'bar', quality: 'good' },
        'gas/telemetry/grs3/flow': { value: baseFlow * 1.2, unit: 'm³/h', quality: 'good' }
      }
    },
    
    // АСКУГ metering data
    askug: {
      nodes: [
        { id: 'UUG-001', name: 'УУГ-1 ГРС Ташкент', volume: 45678.9, corrected: 45234.5 },
        { id: 'UUG-002', name: 'УУГ-2 ГРС Самарканд', volume: 32456.7, corrected: 32123.4 },
        { id: 'UUG-003', name: 'УУГ-3 ГРС Бухара', volume: 28901.2, corrected: 28567.8 }
      ],
      refuels: [
        { station: 'АГНКС-1', volume: 45.5, amount: 113750, vehicle: '01A123BC' },
        { station: 'АГНКС-2', volume: 38.2, amount: 95500, vehicle: '02B456DE' }
      ]
    },
    
    // 1C OData - accounting data
    onec: {
      counterparties: [
        { ref: 'guid-001', code: '000001', name: 'ООО Газпром Трансгаз', inn: '7736050003' },
        { ref: 'guid-002', code: '000002', name: 'АО УзТрансГаз', inn: '123456789' }
      ],
      documents: [
        { 
          ref: 'doc-001', 
          number: 'РТ-000001', 
          date: now.toISOString().split('T')[0],
          counterparty: 'ООО Газпром Трансгаз',
          amount: 125000000,
          status: 'posted'
        }
      ]
    },
    
    // SAP data
    sap: {
      sales_orders: [
        { id: '100000001', customer: 'ООО ПромГаз', amount: 50000000, currency: 'UZS', status: 'open' },
        { id: '100000002', customer: 'АО УзМет', amount: 78000000, currency: 'UZS', status: 'fulfilled' }
      ],
      purchase_orders: [
        { id: '450000001', vendor: 'PipeCorp Ltd', material: 'Трубы стальные', qty: 1000 }
      ]
    },
    
    // Email notifications
    email_queue: [
      {
        to: 'manager@gasplant.uz',
        subject: `Ежедневный отчёт ${now.toLocaleDateString('ru-RU')}`,
        type: 'daily_report',
        status: 'pending'
      }
    ],
    
    // Alerts
    alerts: []
  };
}

// Generate historical data for ML training
function generateHistoricalData(days = 150) {
  const data = [];
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const seasonality = Math.sin((i / 365) * Math.PI * 2) * 0.3;
    const trend = i * 0.001;
    const noise = (Math.random() - 0.5) * 0.1;
    
    data.push({
      date: date.toISOString().split('T')[0],
      
      // Gas balance metrics
      production: Math.round(50000 * (1 + seasonality + trend + noise)),
      consumption: Math.round(45000 * (1 + seasonality + trend + noise * 1.2)),
      import: Math.round(5000 * (1 + noise)),
      export: Math.round(3000 * (1 + noise * 0.5)),
      balance: Math.round(5000 * (1 + seasonality)),
      
      // Operational metrics
      pressure_avg: Math.round((2.5 + seasonality * 0.2 + noise * 0.1) * 100) / 100,
      temperature_avg: Math.round((15 + seasonality * 10 + noise * 2) * 10) / 10,
      flow_rate: Math.round(1200 + seasonality * 200 + noise * 100),
      
      // Financial metrics
      revenue: Math.round(500000000 * (1 + trend + seasonality * 0.5)),
      costs: Math.round(350000000 * (1 + trend * 0.8)),
      profit: Math.round(150000000 * (1 + trend * 1.2)),
      
      // Quality metrics
      methane_content: Math.round((95 + noise * 2) * 10) / 10,
      impurity_level: Math.round((2 + noise * 0.5) * 100) / 100,
      
      // Safety metrics
      incidents: Math.random() > 0.95 ? 1 : 0,
      maintenance_hours: Math.round(20 + Math.random() * 10),
      uptime_percent: Math.round((99 + noise) * 100) / 100
    });
  }
  
  return data;
}

// Generate predictions using simple model
function generatePredictions(historicalData, horizon = 30) {
  const predictions = [];
  const lastDate = new Date(historicalData[historicalData.length - 1].date);
  const lastValue = historicalData[historicalData.length - 1];
  
  for (let i = 1; i <= horizon; i++) {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i);
    
    const seasonality = Math.sin((i / 365) * Math.PI * 2) * 0.3;
    const trend = i * 0.001;
    const uncertainty = Math.sqrt(i) * 0.02;
    
    predictions.push({
      date: date.toISOString().split('T')[0],
      
      production: Math.round(lastValue.production * (1 + trend + seasonality)),
      production_lower: Math.round(lastValue.production * (1 + trend + seasonality - uncertainty)),
      production_upper: Math.round(lastValue.production * (1 + trend + seasonality + uncertainty)),
      
      consumption: Math.round(lastValue.consumption * (1 + trend + seasonality * 1.1)),
      consumption_lower: Math.round(lastValue.consumption * (1 + trend + seasonality * 1.1 - uncertainty)),
      consumption_upper: Math.round(lastValue.consumption * (1 + trend + seasonality * 1.1 + uncertainty)),
      
      balance: Math.round(lastValue.balance * (1 + seasonality)),
      revenue: Math.round(lastValue.revenue * (1 + trend)),
      profit: Math.round(lastValue.profit * (1 + trend * 1.1)),
      
      confidence: Math.max(0.5, 1 - uncertainty)
    });
  }
  
  return predictions;
}

// Generate demo data for specific connector
function getConnectorDemoData(connectorType, params = {}) {
  switch (connectorType) {
    case 'onec':
    case 'one_c_odata':
    case 'connector.onec':
      return {
        '@odata.context': '/$metadata#Catalog_Контрагенты',
        value: [
          { Ref: 'guid-001', Code: '000001', Description: 'ООО Газпром Трансгаз', ИНН: '7736050003', КПП: '773601001' },
          { Ref: 'guid-002', Code: '000002', Description: 'АО УзТрансГаз', ИНН: '123456789', КПП: '123456789' },
          { Ref: 'guid-003', Code: '000003', Description: 'ООО ПромГаз Сервис', ИНН: '987654321', КПП: '987654321' }
        ]
      };
      
    case 'sap':
    case 'sap_odata':
    case 'connector.sap':
      return {
        d: {
          results: [
            { SalesOrder: '100000001', SalesOrderType: 'OR', SoldToParty: '100000001', TotalNetAmount: '12500.00', TransactionCurrency: 'USD' },
            { SalesOrder: '100000002', SalesOrderType: 'OR', SoldToParty: '100000002', TotalNetAmount: '28750.00', TransactionCurrency: 'USD' }
          ]
        }
      };
      
    case 'opcua':
    case 'opc_ua':
    case 'connector.opcua':
      return {
        nodeId: params.node_id || 'ns=2;s=GasPipeline.Pressure',
        value: Math.round((2.5 + Math.random() * 0.3) * 100) / 100,
        statusCode: 0,
        sourceTimestamp: new Date().toISOString(),
        quality: 'Good'
      };
      
    case 'askug':
    case 'connector.askug':
      return {
        nodeId: 'UUG-001',
        timestamp: new Date().toISOString(),
        readings: {
          volume: 45678.9,
          volume_corrected: 45234.5,
          temperature: 18.5,
          pressure: 2.45,
          flow_rate: 1250.0
        }
      };
      
    case 'telegram':
    case 'connector.telegram':
      return {
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 10000),
          date: Math.floor(Date.now() / 1000),
          text: params.text || 'Test message'
        }
      };
      
    case 'mqtt':
    case 'connector.mqtt':
      return {
        topic: params.topic || 'gas/telemetry/grs1/pressure',
        payload: {
          device_id: 'GRS-1-PR-001',
          timestamp: new Date().toISOString(),
          value: Math.round((2.5 + Math.random() * 0.3) * 100) / 100,
          unit: 'bar',
          quality: 'good'
        }
      };
      
    case 'database':
    case 'connector.database':
      return [
        { id: 1, name: 'Заказ #12345', amount: 15000000, status: 'completed', created_at: new Date().toISOString() },
        { id: 2, name: 'Заказ #12346', amount: 28750000, status: 'pending', created_at: new Date().toISOString() },
        { id: 3, name: 'Заказ #12347', amount: 9800000, status: 'processing', created_at: new Date().toISOString() }
      ];
      
    case 'email':
    case 'connector.email':
      return {
        accepted: [params.to || 'user@example.com'],
        messageId: `<${Date.now()}@gasplant.uz>`,
        response: '250 OK'
      };
      
    case 'rest':
    case 'connector.rest':
      return {
        status: 'success',
        data: [
          { id: 1, value: Math.random() * 100 },
          { id: 2, value: Math.random() * 100 }
        ],
        timestamp: new Date().toISOString()
      };
      
    default:
      return { data: 'Demo data for ' + connectorType, timestamp: new Date().toISOString() };
  }
}

// Store data in PostgreSQL format
function toPostgresInsert(table, data) {
  const columns = Object.keys(data);
  const values = columns.map(col => {
    const val = data[col];
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
  });
  
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

module.exports = {
  DEMO_CONFIG,
  generateGasPlantData,
  generateHistoricalData,
  generatePredictions,
  getConnectorDemoData,
  toPostgresInsert
};
