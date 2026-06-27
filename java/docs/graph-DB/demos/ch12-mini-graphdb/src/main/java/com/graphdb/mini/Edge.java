package com.graphdb.mini;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class Edge implements GraphElement {
    private static final AtomicLong ID_GEN = new AtomicLong(1);

    public enum Direction { OUTGOING, INCOMING, BOTH }

    private final long id;
    private final String type;
    private final long sourceNodeId;
    private final long targetNodeId;
    private final Map<String, Object> properties;

    public Edge(String type, long sourceNodeId, long targetNodeId) {
        this.id = ID_GEN.getAndIncrement();
        this.type = type;
        this.sourceNodeId = sourceNodeId;
        this.targetNodeId = targetNodeId;
        this.properties = new ConcurrentHashMap<>();
    }

    @Override
    public long getId() { return id; }

    public String getType() { return type; }

    public long getSourceNodeId() { return sourceNodeId; }

    public long getTargetNodeId() { return targetNodeId; }

    @Override
    public Map<String, Object> getProperties() { return properties; }

    @Override
    public void setProperty(String key, Object value) { properties.put(key, value); }

    @Override
    public Object getProperty(String key) { return properties.get(key); }

    @Override
    public String toString() {
        return "Edge(" + id + ") [" + type + "] " + sourceNodeId + " -> " + targetNodeId + " props=" + properties;
    }
}
