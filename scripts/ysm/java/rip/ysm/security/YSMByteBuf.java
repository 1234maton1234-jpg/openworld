package rip.ysm.security;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** Bounded, read-only replacement for the upstream Netty buffer. */
public final class YSMByteBuf implements AutoCloseable {
    private final ByteBuffer buf;
    public YSMByteBuf(byte[] data) { buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN); }
    public int getOffset() { return buf.position(); }
    public void setOffset(int offset) { buf.position(offset); }
    public byte readByte() { return buf.get(); }
    public long readDword() { return Integer.toUnsignedLong(buf.getInt()); }
    public float readAnimationLength() {
        float ticks = buf.getFloat();
        if (ticks == Float.POSITIVE_INFINITY) return -1;
        if (!Float.isFinite(ticks) || ticks < 0) throw new IllegalArgumentException("Invalid YSM animation length");
        return ticks / 20;
    }
    public float readFloat() {
        float n = buf.getFloat();
        if (!Float.isFinite(n)) throw new IllegalArgumentException("Non-finite YSM number " + n + " at offset " + (buf.position()-4));
        return n;
    }
    public long readVarLong() {
        long value = 0;
        for (int i = 0; i < 10; i++) {
            int b = Byte.toUnsignedInt(buf.get());
            if (i == 9 && b > 1) throw new IllegalArgumentException("Invalid YSM varint");
            value |= (long)(b & 127) << (i * 7);
            if (b < 128) return value;
        }
        throw new IllegalArgumentException("Invalid YSM varint");
    }
    public int readVarInt() {
        long n = readVarLong();
        if (n < 0 || n > 64 * 1024 * 1024) throw new IllegalArgumentException("YSM value exceeds limit");
        return (int)n;
    }
    public byte[] readByteArray() {
        int size = readVarInt();
        if (size > buf.remaining()) throw new IllegalArgumentException("Truncated YSM buffer");
        byte[] bytes = new byte[size];
        buf.get(bytes);
        return bytes;
    }
    public String readString() { return new String(readByteArray(), StandardCharsets.UTF_8); }
    public void skipBytes(int n) {
        if (n < 0 || n > buf.remaining()) throw new IllegalArgumentException("Truncated YSM buffer");
        buf.position(buf.position() + n);
    }
    public void close() { }
}
