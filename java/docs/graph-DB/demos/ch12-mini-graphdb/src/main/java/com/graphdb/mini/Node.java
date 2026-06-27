package com.graphdb.mini;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicLong;

public class Node implements GraphElement {
    private static final AtomicLong ID_GEN = new AtomicLong(1);

    private final long id;
    private final Set<String> labels;
    private final Map<String, Object> properties;
    private final Set<Long> incomingEdges;
    private final Set<Long> outgoingEdges;

    public Node(String... labels) {
        this.id = ID_GEN.getAndIncrement();
        this.labels = new CopyOnWriteArraySet<>(Arrays.asList(labels));
        this.properties = new ConcurrentHashMap<>();
        this.incomingEdges = ConcurrentHashMap.newKeySet();
        this.outgoingEdges = ConcurrentHashMap.newKeySet();
    }

    @Override
    public long getId() { return id; }

    public Set<String> getLabels() { return labels; }

    public void addLabel(String label) { labels.add(label); }

    public boolean hasLabel(String label) { return labels.contains(label); }

    @Override
    public Map<String, Object> getProperties() { return properties; }

    @Override
    public void setProperty(String key, Object value) { properties.put(key, value); }

    @Override
    public Object getProperty(String key) { return properties.get(key); }

    public void addIncomingEdge(long edgeId) { incomingEdges.add(edgeId); }

    public void removeIncomingEdge(long edgeId) { incomingEdges.remove(edgeId); }

    public Set<Long> getIncomingEdges() { return incomingEdges; }

    public void addOutgoingEdge(long edgeId) { outgoingEdges.add(edgeId); }

    public void removeOutgoingEdge(long edgeId) { outgoingEdges.remove(edgeId); }

    public Set<Long> getOutgoingEdges() { return outgoingEdges; }

    @Override
    public String toString() {
        return "Node(" + id + ") labels=" + labels + " props=" + properties;
    }
}
