import rip.ysm.algorithms.CityHash;
import rip.ysm.algorithms.MT19937;
import rip.ysm.algorithms.XChaCha20;
import com.elfmcys.yesstevemodel.resource.YSMBinaryDeserializer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.lang.reflect.Array;
import java.lang.reflect.Modifier;
import java.util.*;

public final class Codec {
    private static final long FILE_SEED = 0x9E5599DB80C67C29L;
    private static final long RESOURCE_SEED = 0xA62B1A2C43842BC3L;
    private static final long KEY_SEED = 0xD017CBBA7B5D3581L;
    private static byte[] xor(byte[] bytes, byte[] key) {
        MT19937 mt = new MT19937(new CityHash().hash64WithSeed(key, KEY_SEED));
        byte[] out = bytes.clone();
        for (int i = 0; i < bytes.length;) {
            long value = mt.extract_number();
            for (int j = 0; j < 8 && i < bytes.length; j++, i++) out[i] ^= (byte)(value >>> (j * 8));
        }
        return out;
    }
    private static byte[] unpack(byte[] data) throws Exception {
        if (data.length < 80) throw new IllegalArgumentException("Truncated YSM file");
        int header = 0;
        while (header < Math.min(data.length - 68, 1024 * 1024) && data[header] != 0) header++;
        if (data[header] != 0 || header + 5 >= data.length - 64) throw new IllegalArgumentException("Invalid YSM header");
        ByteBuffer buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        if (buf.getInt(header + 1) != 3) throw new IllegalArgumentException("Only YSM crypto version 3 is supported");
        long hash = new CityHash().hash64WithSeed(Arrays.copyOf(data, data.length - 8), FILE_SEED);
        if (hash != buf.getLong(data.length - 8)) throw new IllegalArgumentException("YSM file hash mismatch");
        int tail = data.length - 64;
        byte[] key = Arrays.copyOfRange(data, tail, tail + 32), iv = Arrays.copyOfRange(data, tail + 32, tail + 56);
        byte[] clear = xor(XChaCha20.decryptYSM(Arrays.copyOfRange(data, header + 5, tail), key, iv, RESOURCE_SEED), Arrays.copyOfRange(data, tail, tail + 56));
        if (clear.length < 2) throw new IllegalArgumentException("Truncated YSM payload");
        int offset = 2 + ((Byte.toUnsignedInt(clear[0]) | (Byte.toUnsignedInt(clear[1]) << 8)) & 1023);
        if (offset >= clear.length) throw new IllegalArgumentException("Invalid YSM padding");
        return Arrays.copyOfRange(clear, offset, clear.length);
    }
    private static void json(StringBuilder out, Object value) throws Exception {
        if (value == null) { out.append("null"); return; }
        if (value instanceof String s) {
            out.append('"');
            for (char c : s.toCharArray()) {
                if (c == '"' || c == '\\') out.append('\\').append(c);
                else if (c < 32) out.append(String.format("\\u%04x", (int)c));
                else out.append(c);
            }
            out.append('"');
        } else if (value instanceof Number || value instanceof Boolean) out.append(value);
        else if (value instanceof byte[] bytes) json(out, Base64.getEncoder().encodeToString(bytes));
        else if (value instanceof Map<?,?> map) {
            out.append('{'); boolean first = true;
            for (var entry : map.entrySet()) {
                if (!first) out.append(','); first = false;
                json(out, entry.getKey().toString()); out.append(':'); json(out, entry.getValue());
            }
            out.append('}');
        } else if (value instanceof Iterable<?> list) {
            out.append('['); boolean first = true;
            for (Object item : list) { if (!first) out.append(','); first = false; json(out, item); }
            out.append(']');
        } else if (value.getClass().isArray()) {
            out.append('[');
            for (int i = 0; i < Array.getLength(value); i++) { if (i > 0) out.append(','); json(out, Array.get(value, i)); }
            out.append(']');
        } else {
            out.append('{'); boolean first = true;
            for (var field : value.getClass().getFields()) {
                if (Modifier.isStatic(field.getModifiers())) continue;
                if (!first) out.append(','); first = false;
                json(out, field.getName()); out.append(':'); json(out, field.get(value));
            }
            out.append('}');
        }
    }
    public static void main(String[] args) throws Exception {
        byte[] bytes = System.in.readNBytes(64 * 1024 * 1024 + 1);
        if (bytes.length > 64 * 1024 * 1024) throw new IllegalArgumentException("YSM input exceeds limit");
        if (args.length != 1) throw new IllegalArgumentException("Expected unpack or parse");
        if (args[0].equals("unpack")) { System.out.write(unpack(bytes)); return; }
        if (!args[0].equals("parse")) throw new IllegalArgumentException("Unknown operation");
        if (bytes.length < 4) throw new IllegalArgumentException("Truncated YSM buffer");
        int version = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getInt();
        if (version < 1 || version > 32) throw new IllegalArgumentException("Unsupported YSM format version: " + version);
        try (YSMBinaryDeserializer reader = new YSMBinaryDeserializer(bytes)) {
            var model = reader.deserialize();
            StringBuilder out = new StringBuilder();
            json(out, model);
            System.out.print(out);
        }
    }
}
