#version 300 es
in vec4 a_position;
in vec3 a_normal;

uniform mat4 u_mvp;
uniform mat4 u_mv;

out vec3 v_normal;

void main()
{
	gl_Position = u_mvp * a_position;
	v_normal = normalize((u_mv * vec4(a_normal, 1.0)).xyz);
}