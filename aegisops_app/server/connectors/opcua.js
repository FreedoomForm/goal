/**
 * AegisOps — Real OPC UA / SCADA Connector
 * Uses node-opcua-client to connect to real OPC UA servers.
 */
const { BaseConnector } = require('./base');

let opcua;
try {
  opcua = require('node-opcua-client');
} catch {
  opcua = null; // Optional dependency — gracefully degrade
}

class OpcUaConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.nodes = this.config.nodes || [];
    this.securityPolicy = this.config.security_policy || 'None';
    this.securityMode = this.config.security_mode || 'None';
    this._client = null;
    this._session = null;
  }

  async testConnection() {
    if (!opcua) {
      return {
        status: 'unavailable',
        error: 'node-opcua-client не установлен. Выполните: npm install node-opcua-client',
        endpoint: this.baseUrl,
      };
    }
    try {
      const client = opcua.OPCUAClient.create({
        endpointMustExist: false,
        connectionStrategy: {
          maxRetry: 1,
          initialDelay: 1000,
          maxDelay: 3000,
        },
        securityPolicy: opcua.SecurityPolicy[this.securityPolicy] || opcua.SecurityPolicy.None,
        securityMode: opcua.MessageSecurityMode[this.securityMode] || opcua.MessageSecurityMode.None,
      });

      await client.connect(this.baseUrl);
      const session = await client.createSession();

      // Browse root folder to verify connection
      const browseResult = await session.browse('RootFolder');
      const rootNodes = (browseResult.references || []).map(ref => ({
        browseName: ref.browseName.toString(),
        nodeId: ref.nodeId.toString(),
        nodeClass: ref.nodeClass,
      }));

      await session.close();
      await client.disconnect();

      return {
        status: 'online',
        endpoint: this.baseUrl,
        rootNodes,
        nodeCount: rootNodes.length,
      };
    } catch (err) {
      return {
        status: 'offline',
        endpoint: this.baseUrl,
        error: err.message,
        suggestion: 'Проверьте что OPC UA сервер запущен и доступен по указанному адресу',
      };
    }
  }

  /** Read values from configured nodes */
  async fetchData(query = {}) {
    if (!opcua) throw new Error('node-opcua-client not installed');

    const nodesToRead = query.nodes || this.nodes;
    if (!nodesToRead.length) throw new Error('No nodes configured to read');

    const client = opcua.OPCUAClient.create({
      endpointMustExist: false,
      connectionStrategy: { maxRetry: 2, initialDelay: 1000, maxDelay: 5000 },
    });

    try {
      await client.connect(this.baseUrl);
      const session = await client.createSession();

      const results = [];
      for (const nodeId of nodesToRead) {
        try {
          const dataValue = await session.read({ nodeId, attributeId: opcua.AttributeIds.Value });
          const browseNameResult = await session.read({ nodeId, attributeId: opcua.AttributeIds.BrowseName });

          results.push({
            nodeId,
            browseName: browseNameResult.value?.value?.toString() || nodeId,
            value: dataValue.value?.value,
            dataType: dataValue.value?.dataType?.toString(),
            statusCode: dataValue.statusCode?.name || 'Good',
            sourceTimestamp: dataValue.sourceTimestamp?.toISOString(),
            serverTimestamp: dataValue.serverTimestamp?.toISOString(),
          });
        } catch (nodeErr) {
          results.push({
            nodeId,
            error: nodeErr.message,
            statusCode: 'Bad',
          });
        }
      }

      await session.close();
      await client.disconnect();

      return {
        connector: this.name,
        endpoint: this.baseUrl,
        readings: results,
        readCount: results.length,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`OPC UA read failed: ${err.message}`);
    }
  }

  /** Browse the OPC UA address space */
  async discoverSchema(query = {}) {
    if (!opcua) throw new Error('node-opcua-client not installed');

    const rootNodeId = query.rootNodeId || 'RootFolder';

    const client = opcua.OPCUAClient.create({
      endpointMustExist: false,
      connectionStrategy: { maxRetry: 2, initialDelay: 1000, maxDelay: 5000 },
    });

    try {
      await client.connect(this.baseUrl);
      const session = await client.createSession();

      const entities = [];
      const browseResult = await session.browse(rootNodeId);
      for (const ref of browseResult.references || []) {
        const nodeId = ref.nodeId.toString();
        const entry = {
          browseName: ref.browseName.toString(),
          nodeId,
          nodeClass: ref.nodeClass,
          displayName: ref.displayName?.text || ref.browseName.toString(),
        };

        // Try to browse children (one level deep)
        try {
          const childResult = await session.browse(nodeId);
          entry.children = (childResult.references || []).slice(0, 20).map(c => ({
            browseName: c.browseName.toString(),
            nodeId: c.nodeId.toString(),
          }));
        } catch {
          entry.children = [];
        }

        entities.push(entry);
      }

      await session.close();
      await client.disconnect();

      return { entities, endpoint: this.baseUrl };
    } catch (err) {
      throw new Error(`OPC UA browse failed: ${err.message}`);
    }
  }

  /** Write value to an OPC UA node */
  async pushData(payload) {
    if (!opcua) throw new Error('node-opcua-client not installed');

    const { nodeId, value, dataType } = payload;
    if (!nodeId || value === undefined) throw new Error('nodeId and value are required');

    const client = opcua.OPCUAClient.create({ endpointMustExist: false });
    try {
      await client.connect(this.baseUrl);
      const session = await client.createSession();

      const statusCode = await session.write({
        nodeId,
        attributeId: opcua.AttributeIds.Value,
        value: {
          value: {
            dataType: opcua.DataType[dataType] || opcua.DataType.Double,
            value: Number(value),
          },
        },
      });

      await session.close();
      await client.disconnect();

      return {
        success: statusCode.name === 'Good',
        statusCode: statusCode.name,
        nodeId,
      };
    } catch (err) {
      throw new Error(`OPC UA write failed: ${err.message}`);
    }
  }
}

module.exports = { OpcUaConnector };
