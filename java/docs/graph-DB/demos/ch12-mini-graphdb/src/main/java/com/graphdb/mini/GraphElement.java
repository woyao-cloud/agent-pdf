package com.graphdb.mini;

import java.util.Map;

public interface GraphElement {
    long getId();
    Map<String, Object> getProperties();
    void setProperty(String key, Object value);
    Object getProperty(String key);
}
