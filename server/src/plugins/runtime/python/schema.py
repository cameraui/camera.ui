from typing import TypeGuard, cast

from _camera_ui_tools.camera_ui_sdk import (
    JsonSchema,
    JsonSchemaArray,
    JsonSchemaBoolean,
    JsonSchemaButton,
    JsonSchemaEnum,
    JsonSchemaNumber,
    JsonSchemaString,
    JsonSchemaSubmit,
    JsonSchemaWithoutCallbacks,
    JsonSchemaWithoutKey,
)

SchemaDefaultValue = str | int | float | bool | list[str] | list[int] | list[float] | list[bool] | None


def is_string_type(schema: JsonSchema) -> TypeGuard[JsonSchemaString]:
    return schema.get("type") == "string" and "enum" not in schema


def is_number_type(schema: JsonSchema) -> TypeGuard[JsonSchemaNumber]:
    return schema.get("type") == "number"


def is_boolean_type(schema: JsonSchema) -> TypeGuard[JsonSchemaBoolean]:
    return schema.get("type") == "boolean"


def is_enum_type(schema: JsonSchema) -> TypeGuard[JsonSchemaEnum]:
    return schema.get("type") == "string" and "enum" in schema


def is_array_type(schema: JsonSchema) -> TypeGuard[JsonSchemaArray]:
    return schema.get("type") == "array"


def is_button_type(schema: JsonSchema) -> TypeGuard[JsonSchemaButton]:
    return schema.get("type") == "button"


def is_submit_type(schema: JsonSchema) -> TypeGuard[JsonSchemaSubmit]:
    return schema.get("type") == "submit"


def generate_default_value(schema: JsonSchema) -> SchemaDefaultValue:
    # Return explicit default if provided
    if "defaultValue" in schema:
        return cast(SchemaDefaultValue, schema["defaultValue"])

    # Generate default based on type
    match schema["type"]:
        case "string":
            if "enum" in schema:
                if "multiple" in schema and schema["multiple"]:
                    return []
                elif "required" in schema and schema["required"]:
                    return schema["enum"][0]
            return ""
        case "number":
            return 0
        case "boolean":
            return False
        case "array":
            return []
        case _:
            return None


def generate_config_from_schemas(schemas: list[JsonSchema]) -> dict[str, SchemaDefaultValue]:
    config: dict[str, SchemaDefaultValue] = {}

    for schema in schemas:
        # Skip button and submit types as they don't have values
        if is_button_type(schema) or is_submit_type(schema):
            continue

        config[schema["key"]] = generate_default_value(schema)

    return config


def get_value_by_key(
    config: dict[str, SchemaDefaultValue] | None = None, key: str = ""
) -> SchemaDefaultValue:
    if config is None:
        config = {}

    # For simple keys without nesting
    if "." not in key and "[" not in key:
        return config.get(key)

    # For nested keys or array access
    keys: list[str] = []
    for part in key.split("."):
        if "[" in part:
            parts = part.split("[")
            keys.append(parts[0])
            # Handle potential multiple array indices like a[0][1]
            for index_part in parts[1:]:
                keys.append(index_part.rstrip("]"))
        else:
            keys.append(part)

    current: SchemaDefaultValue | dict[str, SchemaDefaultValue] = config
    for k in keys:
        if current is None or not isinstance(current, dict | list):
            return None

        if isinstance(current, dict):
            current = current.get(k)  # type: ignore[assignment]
        elif k.isdigit():
            index = int(k)
            current = current[index] if 0 <= index < len(current) else None  # type: ignore[index,assignment]
        else:
            return None

    return cast(SchemaDefaultValue, current)


def remove_callbacks_from_schema(
    schema: JsonSchema | JsonSchemaWithoutCallbacks | JsonSchemaWithoutKey,
) -> JsonSchemaWithoutCallbacks:
    rest = {k: v for k, v in schema.items() if k not in ["onSet", "onGet", "onClick"]}

    if rest["type"] == "array" and "items" in rest:
        rest["items"] = remove_callbacks_from_schema(cast(JsonSchema, rest["items"]))

    return cast(JsonSchemaWithoutCallbacks, rest)


def remove_callbacks_from_schemas(schemas: list[JsonSchema]) -> list[JsonSchemaWithoutCallbacks]:
    return [remove_callbacks_from_schema(schema) for schema in schemas]
